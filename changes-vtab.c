#include "changes-vtab.h"
#include <string.h>
#include <assert.h>
#include <stdint.h>
#include <stdatomic.h>
#include "consts.h"
#include "util.h"
#include "crsqlite.h"
#include "changes-vtab-read.h"
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
      "CREATE TABLE x([table] NOT NULL, [pk] NOT NULL, [col_vals] NOT NULL, [col_versions] NOT NULL, [version], [site_id] NOT NULL)");
#define CHANGES_SINCE_VTAB_TBL 0
#define CHANGES_SINCE_VTAB_PK 1
#define CHANGES_SINCE_VTAB_COL_VALS 2
#define CHANGES_SINCE_VTAB_COL_VRSNS 3
#define CHANGES_SINCE_VTAB_VRSN 4
#define CHANGES_SINCE_VTAB_SITE_ID 5
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

  // do not free colVrsns as it is a reference
  // to the data from the pChangesStmt
  // and is thus managed by that statement
  crsr->colVrsns = 0;

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
  const char *colVrsns = (const char *)sqlite3_column_text(pCur->pChangesStmt, COL_VRSNS);
  int numCols = sqlite3_column_int(pCur->pChangesStmt, NUM_COLS);
  sqlite3_int64 minv = sqlite3_column_int64(pCur->pChangesStmt, MIN_V);

  if (numCols == 0)
  {
    // TODO: this could be an insert where the table only has primary keys and no non-primary key columns
    pTabBase->zErrMsg = sqlite3_mprintf("Received a change set that had 0 columns from table %s", tbl);
    changesCrsrFinalize(pCur);
    return SQLITE_ERROR;
  }

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
  char *zSql = crsql_rowPatchDataQuery(pCur->pTab->db, tblInfo, numCols, colVrsns, pks);
  if (zSql == 0)
  {
    pTabBase->zErrMsg = sqlite3_mprintf("crsql internal error generationg raw data fetch query for table %s", tbl);
    return SQLITE_ERROR;
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
  pCur->colVrsns = colVrsns;
  pCur->version = minv;

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
  case CHANGES_SINCE_VTAB_COL_VALS:
    sqlite3_result_value(ctx, sqlite3_column_value(pCur->pRowStmt, 0));
    break;
  case CHANGES_SINCE_VTAB_COL_VRSNS:
    sqlite3_result_text(ctx, pCur->colVrsns, -1, 0);
    break;
  case CHANGES_SINCE_VTAB_VRSN:
    sqlite3_result_int64(ctx, pCur->version);
    break;
  case CHANGES_SINCE_VTAB_SITE_ID:
    // TODO: thread through site id result
    sqlite3_result_int(ctx, 0);
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

/**
 * Given a json map of received col versions,
 * return an array indexed by cid that contains the index
 * of the received col version.
 *
 * Returns r[0] = -1 on delete
 *
 * Returns 0 on failure.
 */
int *crsql_allReceivedCids(
    sqlite3 *db,
    const unsigned char *colVrsns,
    int totalNumCols,
    int *rNumReceivedCids)
{
  int rc = SQLITE_OK;
  sqlite3_stmt *pStmt = 0;
  char *zSql = sqlite3_mprintf("SELECT key as cid FROM json_each(%Q)", colVrsns);
  rc = sqlite3_prepare(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    sqlite3_finalize(pStmt);
    return 0;
  }

  int *ret = sqlite3_malloc(totalNumCols * sizeof *ret);
  memset(ret, 0, totalNumCols * sizeof *ret);
  int numReceivedCids = 0;
  rc = sqlite3_step(pStmt);
  while (rc == SQLITE_ROW)
  {
    int cid = sqlite3_column_int(pStmt, 0);
    if (cid == DELETE_CID_SENTINEL)
    {
      sqlite3_finalize(pStmt);
      ret[0] = -1;
      return ret;
    }
    if (cid > totalNumCols || numReceivedCids >= totalNumCols)
    {
      sqlite3_free(ret);
      sqlite3_finalize(pStmt);
      return 0;
    }
    ret[cid] = numReceivedCids;
    ++numReceivedCids;
    rc = sqlite3_step(pStmt);
  }

  if (rc != SQLITE_DONE)
  {
    sqlite3_free(ret);
    sqlite3_finalize(pStmt);
    return 0;
  }

  *rNumReceivedCids = numReceivedCids;
  return ret;
}

char *crsql_changesTabConflictSets(
    char **nonPkValsForInsert,
    crsql_ColumnInfo *columnInfosForInsert,
    int allChangedCidsLen)
{
  return 0;
}

/**
 * Given a json map of received col versions,
 * return an array of the cids that should actually
 * overwrite values on the local db.
 *
 * Note that this is different from `allReceivedCids` which returns
 * an array indexed by cid containing index locations of the
 * col version.
 *
 * This is a regular array containing cids.
 *
 * The former is used for extracting data from concatenated col vals.
 */
int *crsql_allChangedCids(
    sqlite3 *db,
    const unsigned char *insertColVrsns,
    const unsigned char *insertTbl,
    const char *pkWhereList,
    int totalNumCols,
    int *rlen,
    const void *insertSiteId,
    int insertSiteIdLen,
    char **errmsg)
{
  char *zSql = 0;
  // cmp insertSiteId
  int siteComparison = memcmp(
      insertSiteId,
      crsql_siteIdBlob,
      insertSiteIdLen < crsql_siteIdBlobSize ? insertSiteIdLen : crsql_siteIdBlobSize);

  if (siteComparison == 0)
  {
    if (insertSiteIdLen > crsql_siteIdBlobSize)
    {
      siteComparison = 1;
    }
    else if (insertSiteIdLen < crsql_siteIdBlobSize)
    {
      siteComparison = -1;
    }
    else
    {
      // we're patching into our own site? Makes no sense.
      *errmsg = sqlite3_mprintf("crsql - a site is trying to patch itself.");
      return 0;
    }
  }

  if (siteComparison > 0)
  {
    zSql = sqlite3_mprintf(
        "SELECT key as cid FROM json_each(%Q)\
          LEFT JOIN \"%s__crsql_clock\"\
          WHERE %z AND value >= \"%s__crsql_clock\".__crsql_version",
        insertColVrsns,
        insertTbl,
        pkWhereList,
        insertTbl);
  }
  else if (siteComparison < 0)
  {
    zSql = sqlite3_mprintf(
        "SELECT key as cid FROM json_each(%Q)\
          LEFT JOIN \"%s__crsql_clock\"\
          WHERE %z AND value > \"%s__crsql_clock\".__crsql_version",
        insertColVrsns,
        insertTbl,
        pkWhereList,
        insertTbl);
  }
  else
  {
    // should be impossible given prior siteComparison == 0 if statement
    return 0;
  }

  // run zSql
  sqlite3_stmt *pStmt = 0;
  int rc = sqlite3_prepare(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    sqlite3_finalize(pStmt);
    return 0;
  }

  int *ret = sqlite3_malloc(totalNumCols * sizeof *ret);
  memset(ret, 0, totalNumCols * sizeof *ret);
  rc = sqlite3_step(pStmt);
  int i = 0;
  while (rc == SQLITE_ROW)
  {
    int cid = sqlite3_column_int(pStmt, 0);
    if (cid > totalNumCols || i >= totalNumCols)
    {
      sqlite3_free(ret);
      sqlite3_finalize(pStmt);
      return 0;
    }
    ret[i] = cid;
    ++i;
    rc = sqlite3_step(pStmt);
  }

  if (rc != SQLITE_DONE)
  {
    sqlite3_free(ret);
    sqlite3_finalize(pStmt);
    return 0;
  }

  return ret;
}

int crsql_mergeInsert(
    sqlite3_vtab *pVTab,
    int argc,
    sqlite3_value **argv,
    sqlite3_int64 *pRowid,
    char **errmsg)
{
  // he argv[1] parameter is the rowid of a new row to be inserted into the virtual table.
  // If argv[1] is an SQL NULL, then the implementation must choose a rowid for the newly inserted row
  int rowidType = sqlite3_value_type(argv[1]);
  int rc = 0;
  crsql_Changes_vtab *pTab = (crsql_Changes_vtab *)pVTab;
  sqlite3 *db = pTab->db;
  char *zSql = 0;
  int ignore = 0;

  // column values exist in argv[2] and following.
  const int insertTblLen = sqlite3_value_bytes(argv[2 + CHANGES_SINCE_VTAB_TBL]);
  if (insertTblLen > MAX_TBL_NAME_LEN)
  {
    *errmsg = sqlite3_mprintf("crsql - table name exceeded max length");
    return SQLITE_ERROR;
  }
  // safe given we only use this if it exactly matches a table name
  // from tblInfo
  const unsigned char *insertTbl = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_TBL]);
  // TODO: sanitize / assert proper quoting of pks
  const unsigned char *insertPks = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_PK]);
  // TODO: sanitize / assert proper quoting of vals
  const unsigned char *insertVals = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_COL_VALS]);
  // safe given we only use via %Q and json processing
  const unsigned char *insertColVrsns = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_COL_VRSNS]);
  // sqlite3_int64 insertVrsn = sqlite3_value_int64(argv[2 + CHANGES_SINCE_VTAB_VRSN]);
  int insertSiteIdLen = sqlite3_value_bytes(argv[2 + CHANGES_SINCE_VTAB_SITE_ID]);
  if (insertSiteIdLen > SITE_ID_LEN)
  {
    *errmsg = sqlite3_mprintf("crsql - site id exceeded max length");
    return SQLITE_ERROR;
  }
  // safe given we only use siteid via `bind`
  const void *insertSiteId = sqlite3_value_blob(argv[2 + CHANGES_SINCE_VTAB_SITE_ID]);

  crsql_TableInfo *tblInfo = crsql_findTableInfo(pTab->tableInfos, pTab->tableInfosLen, (const char *)insertTbl);
  if (tblInfo == 0)
  {
    *errmsg = sqlite3_mprintf("crsql - could not find the schema information for table %s", insertTbl);
    return SQLITE_ERROR;
  }

  int numReceivedCids = 0;
  int *allReceivedCids = crsql_allReceivedCids(db, insertColVrsns, tblInfo->baseColsLen, &numReceivedCids);

  if (allReceivedCids == 0)
  {
    sqlite3_free(allReceivedCids);
    *errmsg = sqlite3_mprintf("crsql - failed to extract cids of changed columns");
    return SQLITE_ERROR;
  }

  if (allReceivedCids[0] == -1)
  {
    sqlite3_free(allReceivedCids);
    *errmsg = sqlite3_mprintf("crsql - patching deletes is not yet implemented");
    // can just issue a delete via pkwherelist and be done.
    // rc = sqlite3_exec(db, SET_SYNC_BIT, 0, 0, errmsg);
    return SQLITE_ERROR;
  }

  // TODO: look for the case where the local deleted the row
  // and thus should not take the remote's patch

  // TODO: we can't trust `insertPks`
  char *pkWhereList = crsql_extractPkWhereList(tblInfo, (const char *)insertPks);
  if (pkWhereList == 0)
  {
    *errmsg = sqlite3_mprintf("crsql - failed decoding primary keys for insert");
    sqlite3_free(allReceivedCids);
    return SQLITE_ERROR;
  }

  int allChangedCidsLen = 0;
  int *allChangedCids = crsql_allChangedCids(
      db,
      insertColVrsns,
      insertTbl,
      pkWhereList,
      tblInfo->baseColsLen,
      &allChangedCidsLen,
      insertSiteId,
      insertSiteIdLen,
      errmsg);
  sqlite3_free(pkWhereList);

  if (allChangedCids == 0 || allChangedCidsLen + tblInfo->pksLen > tblInfo->baseColsLen)
  {
    sqlite3_free(allReceivedCids);
    return SQLITE_ERROR;
  }

  if (allChangedCidsLen == 0)
  {
    // the patch doesn't apply -- we're ok and done.
    sqlite3_free(allReceivedCids);
    sqlite3_free(allChangedCids);
    return rc;
  }

  crsql_ColumnInfo columnInfosForInsert[allChangedCidsLen];
  char **pkValsForInsert = crsql_split((const char *)insertPks, PK_DELIM, tblInfo->pksLen);
  char **allReceivedNonPkVals = crsql_split((const char *)insertVals, PK_DELIM, numReceivedCids);
  char *nonPkValsForInsert[allChangedCidsLen];

  // TODO: handle the case where only pks to process
  if (pkValsForInsert == 0 || allReceivedNonPkVals == 0)
  {
    sqlite3_free(allReceivedCids);
    sqlite3_free(allChangedCids);
    return SQLITE_ERROR;
  }

  // TODO: bounds checking
  for (int i = 0; i < allChangedCidsLen; ++i)
  {
    int cid = allChangedCids[i];
    int valIdx = allReceivedCids[cid];
    nonPkValsForInsert[i] = allReceivedNonPkVals[valIdx];
    columnInfosForInsert[i] = tblInfo->baseCols[cid];
  }

  char *pkIdentifierList = crsql_asIdentifierList(tblInfo->pks, tblInfo->pksLen, 0);
  int len = 0;
  for (int i = 0; i < tblInfo->pksLen; ++i)
  {
    len += strlen(pkValsForInsert[i]);
  }
  char *pkValsStr = sqlite3_malloc(len * sizeof *pkValsStr + 1);
  crsql_joinWith(pkValsStr, pkValsForInsert, tblInfo->pksLen, ',');

  len = 0;
  for (int i = 0; i < allChangedCidsLen; ++i)
  {
    len += strlen(nonPkValsForInsert[i]);
  }
  char *nonPkValsStr = sqlite3_malloc(len * sizeof *pkValsStr + 1);
  crsql_joinWith(nonPkValsStr, nonPkValsForInsert, allChangedCidsLen, ',');

  char *conflictSets = crsql_changesTabConflictSets(
      nonPkValsForInsert,
      columnInfosForInsert,
      allChangedCidsLen);

  // TODO: handle case where there are only pks to process
  zSql = sqlite3_mprintf(
      "INSERT INTO \"%s\" (%s, %z)\
      VALUES (%z, %z)\
      ON CONFLICT (%z) DO UPDATE\
      %z",
      tblInfo->tblName,
      pkIdentifierList,
      crsql_asIdentifierList(columnInfosForInsert, allChangedCidsLen, 0),
      pkValsStr,
      nonPkValsStr,
      pkIdentifierList,
      conflictSets);

  for (int i = 0; i < numReceivedCids; ++i)
  {
    sqlite3_free(allReceivedNonPkVals[i]);
  }
  sqlite3_free(allReceivedNonPkVals);
  for (int i = 0; i < tblInfo->pksLen; ++i)
  {
    sqlite3_free(pkValsForInsert[i]);
  }
  sqlite3_free(pkValsForInsert);

  rc = sqlite3_exec(db, SET_SYNC_BIT, 0, 0, errmsg);
  if (rc != SQLITE_OK)
  {
    sqlite3_exec(db, CLEAR_SYNC_BIT, 0, 0, 0);
    return rc;
  }

  rc = sqlite3_exec(db, zSql, 0, 0, errmsg);
  sqlite3_free(zSql);
  sqlite3_exec(db, CLEAR_SYNC_BIT, 0, 0, 0);

  if (rc != SQLITE_OK)
  {
    return rc;
  }

  // update clocks to new vals now
  // insert into x__crr_clock (table, pk, cid, version) values (...)
  // for each cid & version in allChangedCids

  // TODO: Post merge it is technically possible to have non-unique version vals in the clock table...
  // so deal with that and/or make vtab `without rowid`
  // For the merge:
  // (1) pick their clock and put it for the column
  // (2) push our db version if it is behind their clock so we don't issue
  //     events in the past.

  /*
  - go thru allChangedCids
  - build new colInfoArray from it
  - asIdentifierList that colInfoArray for INSER INTO x (identlist)
    - including pks!
  - create an array of values to insert based on allChangedCids
    - split insertVals
    - go thru allChangedCids
    - look up insertVals index based on allReceivedCids
  - VALUES (pks, valsarr) <-- "as value list" ?
  */

  // sqlite is going to somehow provide us with a rowid.
  // TODO: how in the world does it know the rowid of a vtab?
  // unless it runs a query all against our vtab... which I hope not.

  // implementation must set *pRowid to the rowid of the newly inserted row
  // if argv[1] is an SQL NULL
  // sqlite3_value_type(argv[i])==SQLITE_NULL
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
