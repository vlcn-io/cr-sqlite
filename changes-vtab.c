#include "changes-vtab.h"
#include <string.h>
#include <assert.h>
#include <stdint.h>
#include <stdatomic.h>
#include "consts.h"
#include "util.h"
#include "crsqlite.h"
#include "changes-vtab-read.h"
#include "changes-vtab-write.h"
#include "changes-vtab-common.h"

/**
 * Created when the virtual table is initialized.
 * This happens when the vtab is first used in a given connection.
 * The method allocated the crsql_Changes_vtab for use for the duration
 * of the connection.
 */
static int changesConnect(
    sqlite3 *db,
    void *pAux,
    int argc, const char *const *argv,
    sqlite3_vtab **ppVtab,
    char **pzErr)
{
  crsql_Changes_vtab *pNew;
  int rc;

  // TODO: future improvement to include txid
  rc = sqlite3_declare_vtab(
      db,
      // If we go without rowid we need to concat `table || !'! pk` to be the primary key
      // as xUpdate requires a single column to be the primary key if we use without rowid.
      "CREATE TABLE x([table] NOT NULL, [pk] NOT NULL, [cid] NOT NULL, [val], [version] NOT NULL, [site_id] NOT NULL)");
  if (rc != SQLITE_OK)
  {
    return rc;
  }
  pNew = sqlite3_malloc(sizeof(*pNew));
  *ppVtab = (sqlite3_vtab *)pNew;
  if (pNew == 0)
  {
    return SQLITE_NOMEM;
  }
  memset(pNew, 0, sizeof(*pNew));
  pNew->db = db;
  pNew->maxSeenPatchVersion = MIN_POSSIBLE_DB_VERSION;

  rc = crsql_pullAllTableInfos(db, &(pNew->tableInfos), &(pNew->tableInfosLen), &(*ppVtab)->zErrMsg);
  if (rc != SQLITE_OK)
  {
    crsql_freeAllTableInfos(pNew->tableInfos, pNew->tableInfosLen);
    sqlite3_free(pNew);
    return rc;
  }

  return rc;
}

/**
 * Called when the connection closes to free
 * all resources allocated by `changesConnect`
 *
 * I.e., free everything in `crsql_Changes_vtab` / `pVtab`
 */
static int changesDisconnect(sqlite3_vtab *pVtab)
{
  crsql_Changes_vtab *p = (crsql_Changes_vtab *)pVtab;
  crsql_freeAllTableInfos(p->tableInfos, p->tableInfosLen);
  p->tableInfos = 0;
  p->tableInfosLen = 0;
  sqlite3_free(p);
  return SQLITE_OK;
}

/**
 * Called to allocate a cursor for use in executing a query against
 * the virtual table.
 */
static int changesOpen(sqlite3_vtab *p, sqlite3_vtab_cursor **ppCursor)
{
  crsql_Changes_cursor *pCur;
  pCur = sqlite3_malloc(sizeof(*pCur));
  if (pCur == 0)
  {
    return SQLITE_NOMEM;
  }
  memset(pCur, 0, sizeof(*pCur));
  *ppCursor = &pCur->base;
  pCur->pTab = (crsql_Changes_vtab *)p;
  return SQLITE_OK;
}

static int changesCrsrFinalize(crsql_Changes_cursor *crsr)
{
  // Assign pointers to null after freeing
  // since we can get into this twice for the same cursor object.
  int rc = SQLITE_OK;
  rc += sqlite3_finalize(crsr->pChangesStmt);
  crsr->pChangesStmt = 0;
  rc += sqlite3_finalize(crsr->pRowStmt);
  crsr->pRowStmt = 0;

  crsr->cid = -1;
  crsr->version = MIN_POSSIBLE_DB_VERSION;

  return rc;
}

/**
 * Called to reclaim all of the resources allocated in `changesOpen`
 * once a query against the virtual table has completed.
 *
 * We, of course, do not de-allocated the `pTab` reference
 * given `pTab` must persist for the life of the connection.
 *
 * `pChangesStmt` and `pRowStmt` must be finalized.
 *
 * `colVrsns` does not need to be freed as it comes from
 * `pChangesStmt` thus finalizing `pChangesStmt` will
 * release `colVrsnsr`
 */
static int changesClose(sqlite3_vtab_cursor *cur)
{
  crsql_Changes_cursor *pCur = (crsql_Changes_cursor *)cur;
  changesCrsrFinalize(pCur);
  sqlite3_free(pCur);
  return SQLITE_OK;
}

/**
 * version is guaranteed to be unique (it increases on every write)
 * thus we use it for the rowid.
 *
 * Depending on how sqlite treats calls to `xUpdate` we may
 * shift to a `without rowid` table and use `table + pk` concated
 * as the primary key. xUpdate requires a single column to act
 * as the primary key, hence the concatenation that'd be required.
 */
static int changesRowid(sqlite3_vtab_cursor *cur, sqlite_int64 *pRowid)
{
  crsql_Changes_cursor *pCur = (crsql_Changes_cursor *)cur;
  *pRowid = pCur->version;
  return SQLITE_OK;
}

/**
 * Returns true if the cursor has been moved off the last row.
 * `pChangesStmt` is finalized and set to null when this is the case as we
 * finalize `pChangeStmt` in `changesNext` when it returns `SQLITE_DONE`
 */
static int changesEof(sqlite3_vtab_cursor *cur)
{
  crsql_Changes_cursor *pCur = (crsql_Changes_cursor *)cur;
  return pCur->pChangesStmt == 0;
}

// char **crsql_extractValList() {

// }

/**
 * Advances our Changes_cursor to its next row of output.
 *
 * 1. steps pChangesStmt
 * 2. creates a pRowStmt for the latest row
 * 3. saves off `versionCols` to prevent a `sqlite3_column_text` followed by
 * `sqlite3_column_value` (in the changeColumn method) which seems to have
 * undefined behavior / potentially result in freeing.
 * ^ TODO: is this a true problem? Or can we pass thru version cols
 * as we do with other cols?
 */
static int changesNext(sqlite3_vtab_cursor *cur)
{
  crsql_Changes_cursor *pCur = (crsql_Changes_cursor *)cur;
  sqlite3_vtab *pTabBase = (sqlite3_vtab *)(pCur->pTab);
  int rc = SQLITE_OK;

  if (pCur->pChangesStmt == 0)
  {
    pTabBase->zErrMsg = sqlite3_mprintf("crsql internal error: in an unexpected state. pChangesStmt is null.");
    return SQLITE_ERROR;
  }

  if (pCur->pRowStmt != 0)
  {
    // Finalize the prior row result
    // before getting the next row.
    // Do not re-use the statement since we could be entering
    // a new table.
    // An optimization would be to keep (rewind) it if we're processing the same
    // table for many rows.
    sqlite3_finalize(pCur->pRowStmt);
    pCur->pRowStmt = 0;
  }

  // step to next
  // if no row, tear down (finalize) statements
  // set statements to null
  rc = sqlite3_step(pCur->pChangesStmt);
  if (rc != SQLITE_ROW)
  {
    // tear down since we're done
    return changesCrsrFinalize(pCur);
  }

  const char *tbl = (const char *)sqlite3_column_text(pCur->pChangesStmt, TBL);
  const char *pks = (const char *)sqlite3_column_text(pCur->pChangesStmt, PKS);
  int cid = sqlite3_column_int(pCur->pChangesStmt, CID);
  sqlite3_int64 vrsn = sqlite3_column_int64(pCur->pChangesStmt, VRSN);

  crsql_TableInfo *tblInfo = crsql_findTableInfo(pCur->pTab->tableInfos, pCur->pTab->tableInfosLen, tbl);
  if (tblInfo == 0)
  {
    pTabBase->zErrMsg = sqlite3_mprintf("crsql internal error. Could not find schema for table %s", tbl);
    changesCrsrFinalize(pCur);
    return SQLITE_ERROR;
  }

  // TODO: we should require pks in a validation step when
  // building crrs
  if (tblInfo->pksLen == 0)
  {
    crsql_freeTableInfo(tblInfo);
    pTabBase->zErrMsg = sqlite3_mprintf("crr table %s is missing primary key columns", tblInfo->tblName);
    return SQLITE_ERROR;
  }

  // TODO: handle delete patch case
  // There'll be a -1 colVrsn col.
  // And no need for pRowStmt.
  // Ret -1 for delete case for below?
  // Set a marker on the cursor that it represents a deleted row?
  char *zSql = crsql_rowPatchDataQuery(pCur->pTab->db, tblInfo, cid, pks);
  if (zSql == 0)
  {
    pTabBase->zErrMsg = sqlite3_mprintf("crsql internal error generationg raw data fetch query for table %s", tbl);
    return SQLITE_ERROR;
  }

  if (zSql[0] == '\0') {
    // it's a delete -- no row data to grab
    pCur->pRowStmt = 0;
    sqlite3_free(zSql);

    return SQLITE_OK;
  }

  sqlite3_stmt *pRowStmt;
  rc = sqlite3_prepare_v2(pCur->pTab->db, zSql, -1, &pRowStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    pTabBase->zErrMsg = sqlite3_mprintf("crsql internal error preparing row data fetch statement");
    sqlite3_finalize(pRowStmt);
    return rc;
  }

  rc = sqlite3_step(pRowStmt);
  if (rc != SQLITE_ROW)
  {
    pTabBase->zErrMsg = sqlite3_mprintf("crsql internal error fetching row data");
    sqlite3_finalize(pRowStmt);
    return SQLITE_ERROR;
  }
  else
  {
    rc = SQLITE_OK;
  }

  pCur->pRowStmt = pRowStmt;
  pCur->cid = cid;
  pCur->version = vrsn;

  return rc;
}

/**
 * Returns volums for the row at which
 * the cursor currently resides.
 */
static int changesColumn(
    sqlite3_vtab_cursor *cur, /* The cursor */
    sqlite3_context *ctx,     /* First argument to sqlite3_result_...() */
    int i                     /* Which column to return */
)
{
  crsql_Changes_cursor *pCur = (crsql_Changes_cursor *)cur;
  switch (i)
  {
    // we clean up the cursor on moving to the next result
    // so no need to tell sqlite to free these values.
  case CHANGES_SINCE_VTAB_TBL:
    sqlite3_result_value(ctx, sqlite3_column_value(pCur->pChangesStmt, TBL));
    break;
  case CHANGES_SINCE_VTAB_PK:
    sqlite3_result_value(ctx, sqlite3_column_value(pCur->pChangesStmt, PKS));
    break;
  case CHANGES_SINCE_VTAB_CVAL:
    // pRowStmt is null if the event was a delete. i.e., there is no row data.
    // TODO: there's an edge case here where we can end up replicating a bunch of nulls
    // for a row that is deleted but has prior events proceeding the delete.
    // So on row delete we should, in our delete trigger, go drop all
    // state records for the row except the delete event.
    // "all" is actually quite small given we only keep max 1 record per col in a row.
    // so this drop is feasible on delete.
    if (pCur->pRowStmt == 0) {
      sqlite3_result_null(ctx);
    } else {
      sqlite3_result_value(ctx, sqlite3_column_value(pCur->pRowStmt, 0));
    }
    break;
  case CHANGES_SINCE_VTAB_CID:
    sqlite3_result_int(ctx, pCur->cid);
    break;
  case CHANGES_SINCE_VTAB_VRSN:
    sqlite3_result_int64(ctx, pCur->version);
    break;
  case CHANGES_SINCE_VTAB_SITE_ID:
    if (pCur->pRowStmt == 0) {
      sqlite3_result_null(ctx);
    } else {
      sqlite3_result_value(ctx, sqlite3_column_value(pCur->pRowStmt, SITE_ID));
    }
    break;
  default:
    return SQLITE_ERROR;
  }
  // sqlite3_result_value(ctx, sqlite3_column_value(pCur->pRowStmt, i));
  return SQLITE_OK;
}

/**
 * Invoked to kick off the pulling of rows from the virtual table.
 * Provides the constraints with which the vtab can work with
 * to compute what rows to pull.
 *
 * Provided constraints are filled in by the changesBestIndex method.
 */
static int changesFilter(
    sqlite3_vtab_cursor *pVtabCursor,
    int idxNum, const char *idxStr,
    int argc, sqlite3_value **argv)
{
  int rc = SQLITE_OK;
  crsql_Changes_cursor *pCrsr = (crsql_Changes_cursor *)pVtabCursor;
  crsql_Changes_vtab *pTab = pCrsr->pTab;
  sqlite3_vtab *pTabBase = (sqlite3_vtab *)pTab;
  sqlite3 *db = pTab->db;
  char *err = 0;

  // This should never happen. pChangesStmt should be finalized
  // before filter is ever invoked.
  if (pCrsr->pChangesStmt)
  {
    sqlite3_finalize(pCrsr->pChangesStmt);
    pCrsr->pChangesStmt = 0;
  }

  // construct and prepare our union for fetching changes
  char *zSql = crsql_changesUnionQuery(pTab->tableInfos, pTab->tableInfosLen);

  if (zSql == 0)
  {
    pTabBase->zErrMsg = sqlite3_mprintf("crsql internal error generating the query to extract changes.");
    return SQLITE_ERROR;
  }

  sqlite3_stmt *pStmt = 0;
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);
  if (rc != SQLITE_OK)
  {
    pTabBase->zErrMsg = sqlite3_mprintf("crsql internal error preparing the statement to extract changes.");
    sqlite3_finalize(pStmt);
    return rc;
  }

  // pull user provided params to `getChanges`
  int i = 0;
  sqlite3_int64 versionBound = MIN_POSSIBLE_DB_VERSION;
  const char *requestorSiteId = "aa";
  int requestorSiteIdLen = 1;
  if (idxNum & 2)
  {
    versionBound = sqlite3_value_int64(argv[i]);
    ++i;
  }
  if (idxNum & 4)
  {
    requestorSiteIdLen = sqlite3_value_bytes(argv[i]);
    if (requestorSiteIdLen != 0)
    {
      requestorSiteId = (const char *)sqlite3_value_blob(argv[i]);
    }
    else
    {
      requestorSiteIdLen = 1;
    }
    ++i;
  }

  // now bind the params.
  // for each table info we need to bind 2 params:
  // 1. the site id
  // 2. the version
  int j = 1;
  for (i = 0; i < pTab->tableInfosLen; ++i)
  {
    sqlite3_bind_blob(pStmt, j++, requestorSiteId, requestorSiteIdLen, SQLITE_STATIC);
    sqlite3_bind_int64(pStmt, j++, versionBound);
  }

  pCrsr->pChangesStmt = pStmt;
  return changesNext((sqlite3_vtab_cursor *)pCrsr);
}

/*
** SQLite will invoke this method one or more times while planning a query
** that uses the virtual table.  This routine needs to create
** a query plan for each invocation and compute an estimated cost for that
** plan.
** TODO: should we support `where table` filters?
*/
static int changesBestIndex(
    sqlite3_vtab *tab,
    sqlite3_index_info *pIdxInfo)
{
  int idxNum = 0;
  int versionIdx = -1;
  int requestorIdx = -1;

  for (int i = 0; i < pIdxInfo->nConstraint; i++)
  {
    const struct sqlite3_index_constraint *pConstraint = &pIdxInfo->aConstraint[i];
    switch (pConstraint->iColumn)
    {
    case CHANGES_SINCE_VTAB_VRSN:
      if (pConstraint->op != SQLITE_INDEX_CONSTRAINT_GT)
      {
        tab->zErrMsg = sqlite3_mprintf("crsql_changes.version only supports the greater than operator. E.g., version > x");
        return SQLITE_CONSTRAINT;
      }
      versionIdx = i;
      idxNum |= 2;
      break;
    case CHANGES_SINCE_VTAB_SITE_ID:
      if (pConstraint->op != SQLITE_INDEX_CONSTRAINT_NE)
      {
        tab->zErrMsg = sqlite3_mprintf("crsql_changes.site_id only supportes the not equal operator. E.g., site_id != x");
        return SQLITE_CONSTRAINT;
      }
      requestorIdx = i;
      pIdxInfo->aConstraintUsage[i].argvIndex = 2;
      pIdxInfo->aConstraintUsage[i].omit = 1;
      idxNum |= 4;
      break;
    }
  }

  // both constraints are present
  if ((idxNum & 6) == 6)
  {
    pIdxInfo->estimatedCost = (double)1;
    pIdxInfo->estimatedRows = 1;

    pIdxInfo->aConstraintUsage[versionIdx].argvIndex = 1;
    pIdxInfo->aConstraintUsage[versionIdx].omit = 1;
    pIdxInfo->aConstraintUsage[requestorIdx].argvIndex = 2;
    pIdxInfo->aConstraintUsage[requestorIdx].omit = 1;
  }
  // only the version constraint is present
  else if ((idxNum & 2) == 2)
  {
    pIdxInfo->estimatedCost = (double)10;
    pIdxInfo->estimatedRows = 10;

    pIdxInfo->aConstraintUsage[versionIdx].argvIndex = 1;
    pIdxInfo->aConstraintUsage[versionIdx].omit = 1;
  }
  // only the requestor constraint is present
  else if ((idxNum & 4) == 4)
  {
    pIdxInfo->estimatedCost = (double)2147483647;
    pIdxInfo->estimatedRows = 2147483647;

    pIdxInfo->aConstraintUsage[requestorIdx].argvIndex = 1;
    pIdxInfo->aConstraintUsage[requestorIdx].omit = 1;
  }
  // no constraints are present
  else
  {
    pIdxInfo->estimatedCost = (double)2147483647;
    pIdxInfo->estimatedRows = 2147483647;
  }

  pIdxInfo->idxNum = idxNum;
  return SQLITE_OK;
}

static int changesApply(
    sqlite3_vtab *pVTab,
    int argc,
    sqlite3_value **argv,
    sqlite3_int64 *pRowid)
{
  int argv0Type = sqlite3_value_type(argv[0]);
  char *errmsg;
  int rc = SQLITE_OK;
  // if (argc == 1 && argv[0] != 0)
  // {
  //   // delete statement
  //   return crsql_mergeDelete();
  // }
  if (argc > 1 && argv0Type == SQLITE_NULL)
  {
    // insert statement
    // argv[1] is the rowid.. but why would it ever be filled for us?
    rc = crsql_mergeInsert(pVTab, argc, argv, pRowid, &errmsg);
    if (rc != SQLITE_OK)
    {
      pVTab->zErrMsg = errmsg;
    }
    return rc;
  }
  else
  {
    pVTab->zErrMsg = sqlite3_mprintf("Only INSERT statements are allowed against the crsql changes table.");
    return SQLITE_MISUSE;
  }

  return SQLITE_OK;
}

static int changesTxBegin(sqlite3_vtab *pVTab)
{
  int rc = SQLITE_OK;
  crsql_Changes_vtab *tab = (crsql_Changes_vtab *)pVTab;
  tab->maxSeenPatchVersion = MIN_POSSIBLE_DB_VERSION;
  return rc;
}

int crsql_changesTxCommit(sqlite3_vtab *pVTab)
{
  int rc = SQLITE_OK;

  crsql_Changes_vtab *tab = (crsql_Changes_vtab *)pVTab;
  int64_t maxSeenPatchVersion = tab->maxSeenPatchVersion;

  int64_t priorVersion = crsql_dbVersion;
  while (maxSeenPatchVersion > priorVersion)
  {
    if (atomic_compare_exchange_weak(
            &crsql_dbVersion,
            &priorVersion,
            maxSeenPatchVersion))
    {
      break;
    }
  }

  return rc;
}

static int changesTxRollback(sqlite3_vtab *pVTab)
{
  int rc = SQLITE_OK;
  crsql_Changes_vtab *tab = (crsql_Changes_vtab *)pVTab;
  tab->maxSeenPatchVersion = MIN_POSSIBLE_DB_VERSION;
  return rc;
}

sqlite3_module crsql_changesModule = {
    /* iVersion    */ 0,
    /* xCreate     */ 0,
    /* xConnect    */ changesConnect,
    /* xBestIndex  */ changesBestIndex,
    /* xDisconnect */ changesDisconnect,
    /* xDestroy    */ 0,
    /* xOpen       */ changesOpen,
    /* xClose      */ changesClose,
    /* xFilter     */ changesFilter,
    /* xNext       */ changesNext,
    /* xEof        */ changesEof,
    /* xColumn     */ changesColumn,
    /* xRowid      */ changesRowid,
    /* xUpdate     */ changesApply,
    /* xBegin      */ changesTxBegin,
    /* xSync       */ 0,
    /* xCommit     */ crsql_changesTxCommit,
    /* xRollback   */ changesTxRollback,
    /* xFindMethod */ 0,
    /* xRename     */ 0,
    /* xSavepoint  */ 0,
    /* xRelease    */ 0,
    /* xRollbackTo */ 0,
    /* xShadowName */ 0};
