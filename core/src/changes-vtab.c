#include "changes-vtab.h"

#include <assert.h>
#include <stdint.h>
#include <string.h>

#include "changes-vtab-common.h"
#include "changes-vtab-write.h"
#include "consts.h"
#include "crsqlite.h"
#include "ext-data.h"
#include "rust.h"
#include "stmt-cache.h"
#include "util.h"

int crsql_changes_next(sqlite3_vtab_cursor *cur);

/**
 * Created when the virtual table is initialized.
 * This happens when the vtab is first used in a given connection.
 * The method allocated the crsql_Changes_vtab for use for the duration
 * of the connection.
 */
static int changesConnect(sqlite3 *db, void *pAux, int argc,
                          const char *const *argv, sqlite3_vtab **ppVtab,
                          char **pzErr) {
  crsql_Changes_vtab *pNew;
  int rc;

  rc = sqlite3_declare_vtab(
      db,
      "CREATE TABLE x([table] TEXT NOT NULL, [pk] BLOB NOT NULL, [cid] TEXT "
      "NOT NULL, [val] ANY, [col_version] INTEGER NOT NULL, [db_version] "
      "INTEGER "
      "NOT NULL, [site_id] BLOB, [seq] HIDDEN INTEGER NOT NULL)");
  if (rc != SQLITE_OK) {
    *pzErr = sqlite3_mprintf("Could not define the table");
    return rc;
  }
  pNew = sqlite3_malloc(sizeof(*pNew));
  *ppVtab = (sqlite3_vtab *)pNew;
  if (pNew == 0) {
    *pzErr = sqlite3_mprintf("Out of memory");
    return SQLITE_NOMEM;
  }
  memset(pNew, 0, sizeof(*pNew));
  pNew->db = db;
  pNew->pExtData = (crsql_ExtData *)pAux;

  rc = crsql_ensureTableInfosAreUpToDate(db, pNew->pExtData,
                                         &(*ppVtab)->zErrMsg);
  if (rc != SQLITE_OK) {
    *pzErr = sqlite3_mprintf("Could not update table infos");
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
static int changesDisconnect(sqlite3_vtab *pVtab) {
  crsql_Changes_vtab *p = (crsql_Changes_vtab *)pVtab;
  // ext data is free by other registered extensions
  sqlite3_free(p);
  return SQLITE_OK;
}

/**
 * Called to allocate a cursor for use in executing a query against
 * the virtual table.
 */
static int changesOpen(sqlite3_vtab *p, sqlite3_vtab_cursor **ppCursor) {
  crsql_Changes_cursor *pCur;
  pCur = sqlite3_malloc(sizeof(*pCur));
  if (pCur == 0) {
    return SQLITE_NOMEM;
  }
  memset(pCur, 0, sizeof(*pCur));
  *ppCursor = &pCur->base;
  pCur->pTab = (crsql_Changes_vtab *)p;
  return SQLITE_OK;
}

static int changesCrsrFinalize(crsql_Changes_cursor *crsr) {
  // Assign pointers to null after freeing
  // since we can get into this twice for the same cursor object.
  int rc = SQLITE_OK;
  rc += sqlite3_finalize(crsr->pChangesStmt);
  crsr->pChangesStmt = 0;
  rc += crsql_resetCachedStmt(crsr->pRowStmt);
  crsr->pRowStmt = 0;

  crsr->dbVersion = MIN_POSSIBLE_DB_VERSION;

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
static int changesClose(sqlite3_vtab_cursor *cur) {
  crsql_Changes_cursor *pCur = (crsql_Changes_cursor *)cur;
  changesCrsrFinalize(pCur);
  sqlite3_free(pCur);
  return SQLITE_OK;
}

/**
 * Invoked to kick off the pulling of rows from the virtual table.
 * Provides the constraints with which the vtab can work with
 * to compute what rows to pull.
 *
 * Provided constraints are filled in by the changesBestIndex method.
 */
int crsql_changes_filter(sqlite3_vtab_cursor *pVtabCursor, int idxNum,
                         const char *idxStr, int argc, sqlite3_value **argv);

static const char *getOperatorString(unsigned char op) {
  // SQLITE_INDEX_CONSTRAINT_NE
  switch (op) {
    case SQLITE_INDEX_CONSTRAINT_EQ:
      return "=";
    case SQLITE_INDEX_CONSTRAINT_GT:
      return ">";
    case SQLITE_INDEX_CONSTRAINT_LE:
      return "<=";
    case SQLITE_INDEX_CONSTRAINT_LT:
      return "<";
    case SQLITE_INDEX_CONSTRAINT_GE:
      return ">=";
    case SQLITE_INDEX_CONSTRAINT_MATCH:
      return "MATCH";
    case SQLITE_INDEX_CONSTRAINT_LIKE:
      return "LIKE";
    case SQLITE_INDEX_CONSTRAINT_GLOB:
      return "GLOB";
    case SQLITE_INDEX_CONSTRAINT_REGEXP:
      return "REGEXP";
    case SQLITE_INDEX_CONSTRAINT_NE:
      return "!=";
    case SQLITE_INDEX_CONSTRAINT_ISNOT:
      return "IS NOT";
    case SQLITE_INDEX_CONSTRAINT_ISNOTNULL:
      return "IS NOT NULL";
    case SQLITE_INDEX_CONSTRAINT_ISNULL:
      return "IS NULL";
    case SQLITE_INDEX_CONSTRAINT_IS:
      return "IS";
    default:
      return 0;
  }
}

static const char *getClockTblColName(int colIdx) {
  switch (colIdx) {
    case CHANGES_SINCE_VTAB_TBL:
      // TODO: stick tbl constraint into pTab?
      // to read out later?
      return "tbl";
    case CHANGES_SINCE_VTAB_PK:
      // TODO: bind param it? o wait, it would need splitting.
      // the clock table has pks split out.
      return "pks";
    case CHANGES_SINCE_VTAB_CID:
      return "cid";
    case CHANGES_SINCE_VTAB_CVAL:
      return 0;
    case CHANGES_SINCE_VTAB_COL_VRSN:
      return "col_vrsn";
    case CHANGES_SINCE_VTAB_DB_VRSN:
      return "db_vrsn";
    case CHANGES_SINCE_VTAB_SITE_ID:
      return "site_id";
    case CHANGES_SINCE_VTAB_SEQ:
      return "seq";
  }

  return 0;
}

static int colIsUsable(const struct sqlite3_index_constraint *pConstraint) {
  return pConstraint->usable &&
         pConstraint->iColumn != CHANGES_SINCE_VTAB_TBL &&
         pConstraint->iColumn != CHANGES_SINCE_VTAB_PK &&
         pConstraint->iColumn != CHANGES_SINCE_VTAB_CVAL;
}

/*
** SQLite will invoke this method one or more times while planning a query
** that uses the virtual table.  This routine needs to create
** a query plan for each invocation and compute an estimated cost for that
** plan.
** TODO: should we support `where table` filters?
*/
static int changesBestIndex(sqlite3_vtab *tab, sqlite3_index_info *pIdxInfo) {
  int idxNum = 0;

  crsql_Changes_vtab *crsqlTab = (crsql_Changes_vtab *)tab;
  sqlite3_str *pStr = sqlite3_str_new(crsqlTab->db);

  int firstConstraint = 1;
  const char *colName = 0;
  int argvIndex = 1;
  int numUsable = 0;
  for (int i = 0; i < pIdxInfo->nConstraint; ++i) {
    if (colIsUsable(&pIdxInfo->aConstraint[i])) {
      ++numUsable;
    }
  }
  if (numUsable > 0) {
    sqlite3_str_appendall(pStr, "WHERE ");
  }
  for (int i = 0; i < pIdxInfo->nConstraint && numUsable > 0; i++) {
    const struct sqlite3_index_constraint *pConstraint =
        &pIdxInfo->aConstraint[i];
    if (!colIsUsable(&pIdxInfo->aConstraint[i])) {
      continue;
    }
    colName = getClockTblColName(pConstraint->iColumn);
    if (colName != 0) {
      const char *opString = getOperatorString(pConstraint->op);
      if (opString == 0) {
        continue;
      }
      if (firstConstraint) {
        firstConstraint = 0;
      } else {
        sqlite3_str_appendall(pStr, " AND ");
      }

      if (pConstraint->op == SQLITE_INDEX_CONSTRAINT_ISNOTNULL ||
          pConstraint->op == SQLITE_INDEX_CONSTRAINT_ISNULL) {
        sqlite3_str_appendf(pStr, "%s %s", colName, opString);
        pIdxInfo->aConstraintUsage[i].argvIndex = 0;
        pIdxInfo->aConstraintUsage[i].omit = 1;
      } else {
        sqlite3_str_appendf(pStr, "%s %s ?", colName, opString);
        pIdxInfo->aConstraintUsage[i].argvIndex = argvIndex;
        pIdxInfo->aConstraintUsage[i].omit = 1;
        argvIndex += 1;
      }
      colName = 0;
    }

    switch (pConstraint->iColumn) {
      case CHANGES_SINCE_VTAB_DB_VRSN:
        idxNum |= 2;
        break;
      case CHANGES_SINCE_VTAB_SITE_ID:
        idxNum |= 4;
        break;
    }
  }

  int desc = 0;
  if (pIdxInfo->nOrderBy > 0) {
    sqlite3_str_appendall(pStr, " ORDER BY ");
  } else {
    // The user didn't provide an ordering? Tack on a default one that will
    // retrieve changes in-order
    sqlite3_str_appendall(pStr, " ORDER BY db_vrsn, seq ASC");
  }
  firstConstraint = 1;
  for (int i = 0; i < pIdxInfo->nOrderBy; i++) {
    const struct sqlite3_index_orderby *orderBy = &pIdxInfo->aOrderBy[i];
    colName = getClockTblColName(orderBy->iColumn);
    desc = orderBy->desc;

    if (firstConstraint == 1) {
      firstConstraint = 0;
    } else {
      sqlite3_str_appendall(pStr, ", ");
    }
    sqlite3_str_appendf(pStr, "%s", colName);
  }
  if (pIdxInfo->nOrderBy > 0) {
    if (desc) {
      sqlite3_str_appendall(pStr, " DESC");
    } else {
      sqlite3_str_appendall(pStr, " ASC");
    }
  }

  // both constraints are present
  if ((idxNum & 6) == 6) {
    pIdxInfo->estimatedCost = (double)1;
    pIdxInfo->estimatedRows = 1;
  }
  // only the version constraint is present
  else if ((idxNum & 2) == 2) {
    pIdxInfo->estimatedCost = (double)10;
    pIdxInfo->estimatedRows = 10;
  }
  // only the requestor constraint is present
  else if ((idxNum & 4) == 4) {
    pIdxInfo->estimatedCost = (double)2147483647;
    pIdxInfo->estimatedRows = 2147483647;
  }
  // no constraints are present
  else {
    pIdxInfo->estimatedCost = (double)2147483647;
    pIdxInfo->estimatedRows = 2147483647;
  }

  pIdxInfo->idxNum = idxNum;
  pIdxInfo->orderByConsumed = 1;
  pIdxInfo->idxStr = sqlite3_str_finish(pStr);
  // printf("q: %s\n", pIdxInfo->idxStr);
  pIdxInfo->needToFreeIdxStr = 1;
  return SQLITE_OK;
}

int crsql_changes_update(sqlite3_vtab *pVTab, int argc, sqlite3_value **argv,
                         sqlite3_int64 *pRowid);
// If xBegin is not defined xCommit is not called.
int crsql_changes_begin(sqlite3_vtab *pVTab);
int crsql_changes_commit(sqlite3_vtab *pVTab);
int crsql_changes_rowid(sqlite3_vtab_cursor *cur, sqlite_int64 *pRowid);
int crsql_changes_column(
    sqlite3_vtab_cursor *cur, /* The cursor */
    sqlite3_context *ctx,     /* First argument to sqlite3_result_...() */
    int i                     /* Which column to return */
);
int crsql_changes_eof(sqlite3_vtab_cursor *cur);

sqlite3_module crsql_changesModule = {
    /* iVersion    */ 0,
    /* xCreate     */ 0,
    /* xConnect    */ changesConnect,
    /* xBestIndex  */ changesBestIndex,
    /* xDisconnect */ changesDisconnect,
    /* xDestroy    */ 0,
    /* xOpen       */ changesOpen,
    /* xClose      */ changesClose,
    /* xFilter     */ crsql_changes_filter,
    /* xNext       */ crsql_changes_next,
    /* xEof        */ crsql_changes_eof,
    /* xColumn     */ crsql_changes_column,
    /* xRowid      */ crsql_changes_rowid,
    /* xUpdate     */ crsql_changes_update,
    /* xBegin      */ crsql_changes_begin,
    /* xSync       */ 0,
    /* xCommit     */ crsql_changes_commit,
    /* xRollback   */ 0,
    /* xFindMethod */ 0,
    /* xRename     */ 0,
    /* xSavepoint  */ 0,
    /* xRelease    */ 0,
    /* xRollbackTo */ 0,
    /* xShadowName */ 0};
