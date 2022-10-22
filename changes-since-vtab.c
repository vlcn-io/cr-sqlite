#include "changes-since-vtab.h"
#include <string.h>
#include <assert.h>
#include "consts.h"
#include "util.h"

/**
 * vtab usage:
 * SELECT * FROM cfsql_chages WHERE requestor = SITE_ID AND version > V
 *
 * returns:
 * table_name, quote-concated pks ~'~, json-encoded vals, json-encoded versions, curr version
 */

typedef struct cfsql_ChangesSince_vtab cfsql_ChangesSince_vtab;
struct cfsql_ChangesSince_vtab
{
  sqlite3_vtab base; /* Base class - must be first */
  sqlite3 *db;
};

/* A subclass of sqlite3_vtab_cursor which will
** serve as the underlying representation of a cursor that scans
** over rows of the result
*/
typedef struct cfsql_ChangesSince_cursor cfsql_ChangesSince_cursor;
struct cfsql_ChangesSince_cursor
{
  sqlite3_vtab_cursor base; /* Base class - must be first */

  cfsql_ChangesSince_vtab *pTab;
  cfsql_TableInfo **tableInfos;
  int tableInfosLen;

  // The statement that is returning the identifiers
  // of what has changed
  sqlite3_stmt *pChangesStmt;
  sqlite3_stmt *pRowStmt;

  const char *colVrsns;
  sqlite3_int64 version;
};

/*
** The changesSinceVtabConnect() method is invoked to create a new
** template virtual table.
**
** Think of this routine as the constructor for templatevtab_vtab objects.
**
** All this routine needs to do is:
**
**    (1) Allocate the templatevtab_vtab object and initialize all fields.
**
**    (2) Tell SQLite (via the sqlite3_declare_vtab() interface) what the
**        result set of queries against the virtual table will look like.
*/
static int changesSinceConnect(
    sqlite3 *db,
    void *pAux,
    int argc, const char *const *argv,
    sqlite3_vtab **ppVtab,
    char **pzErr)
{
  cfsql_ChangesSince_vtab *pNew;
  int rc;

  // TODO: future improvement to include txid
  rc = sqlite3_declare_vtab(
      db,
      "CREATE TABLE x([table], [pk], [col_vals], [col_versions], [version], [requestor] hidden)");
#define CHANGES_SINCE_VTAB_TBL 0
#define CHANGES_SINCE_VTAB_PK 1
#define CHANGES_SINCE_VTAB_COL_VALS 2
#define CHANGES_SINCE_VTAB_COL_VRSNS 3
#define CHANGES_SINCE_VTAB_VRSN 4
#define CHANGES_SINCE_VTAB_RQSTR 5
  if (rc == SQLITE_OK)
  {
    pNew = sqlite3_malloc(sizeof(*pNew));
    *ppVtab = (sqlite3_vtab *)pNew;
    if (pNew == 0)
    {
      return SQLITE_NOMEM;
    }
    memset(pNew, 0, sizeof(*pNew));
    pNew->db = db;
  }
  return rc;
}

/*
** Destructor for ChangesSince_vtab objects
*/
static int changesSinceDisconnect(sqlite3_vtab *pVtab)
{
  cfsql_ChangesSince_vtab *p = (cfsql_ChangesSince_vtab *)pVtab;
  sqlite3_free(p);
  return SQLITE_OK;
}

/*
** Constructor for a new ChangesSince cursors object.
*/
static int changesSinceOpen(sqlite3_vtab *p, sqlite3_vtab_cursor **ppCursor)
{
  cfsql_ChangesSince_cursor *pCur;
  pCur = sqlite3_malloc(sizeof(*pCur));
  if (pCur == 0)
  {
    return SQLITE_NOMEM;
  }
  memset(pCur, 0, sizeof(*pCur));
  *ppCursor = &pCur->base;
  pCur->pTab = (cfsql_ChangesSince_vtab *)p;
  return SQLITE_OK;
}

static int changesSinceCrsrFinalize(cfsql_ChangesSince_cursor *crsr)
{
  // Assign pointers to null after freeing
  // since we can get into this twice for the same object.
  int rc = SQLITE_OK;
  rc += sqlite3_finalize(crsr->pChangesStmt);
  crsr->pChangesStmt = 0;
  rc += sqlite3_finalize(crsr->pRowStmt);
  crsr->pRowStmt = 0;
  cfsql_freeAllTableInfos(crsr->tableInfos, crsr->tableInfosLen);
  crsr->tableInfos = 0;
  crsr->tableInfosLen = 0;

  // do not free colVrsns as it is a reference
  // to the data from the pChangesStmt
  // and is thus managed by that statement
  crsr->colVrsns = 0;

  return rc;
}

/*
** Destructor for a ChangesSince cursor.
*/
static int changesSinceClose(sqlite3_vtab_cursor *cur)
{
  cfsql_ChangesSince_cursor *pCur = (cfsql_ChangesSince_cursor *)cur;
  changesSinceCrsrFinalize(pCur);
  sqlite3_free(pCur);
  return SQLITE_OK;
}

/*
** Return the rowid for the current row.
*/
static int changesSinceRowid(sqlite3_vtab_cursor *cur, sqlite_int64 *pRowid)
{
  cfsql_ChangesSince_cursor *pCur = (cfsql_ChangesSince_cursor *)cur;
  *pRowid = pCur->version;
  return SQLITE_OK;
}

/*
** Return TRUE if the cursor has been moved off of the last
** row of output.
*/
static int changesSinceEof(sqlite3_vtab_cursor *cur)
{
  cfsql_ChangesSince_cursor *pCur = (cfsql_ChangesSince_cursor *)cur;
  return pCur->pChangesStmt == 0;
}

char *cfsql_changesQueryForTable(cfsql_TableInfo *tableInfo)
{
  if (tableInfo->pksLen == 0)
  {
    return 0;
  }

  char *zSql = sqlite3_mprintf(
      "SELECT\
      %z as pks,\
      '%s' as tbl,\
      json_group_object(__cfsql_col_num, __cfsql_version) as col_vrsns,\
      count(__cfsql_col_num) as num_cols,\
      min(__cfsql_version) as min_v\
    FROM \"%s__cfsql_clock\"\
    WHERE\
      __cfsql_site_id != ?\
    AND\
      __cfsql_version > ?\
    GROUP BY pks",
      cfsql_quoteConcat(tableInfo->pks, tableInfo->pksLen),
      tableInfo->tblName,
      tableInfo->tblName);

  return zSql;
}

char *cfsql_changesUnionQuery(
    cfsql_TableInfo **tableInfos,
    int tableInfosLen)
{
  char *unionsArr[tableInfosLen];
  char *unionsStr = 0;
  int i = 0;

  for (i = 0; i < tableInfosLen; ++i)
  {
    unionsArr[i] = cfsql_changesQueryForTable(tableInfos[i]);
    if (unionsArr[i] == 0)
    {
      for (int j = 0; j < i; j++)
      {
        sqlite3_free(unionsArr[j]);
      }
      return 0;
    }

    if (i < tableInfosLen - 1)
    {
      unionsArr[i] = sqlite3_mprintf("%z %s ", unionsArr[i], UNION);
    }
  }

  // move the array of strings into a single string
  unionsStr = cfsql_join(unionsArr, tableInfosLen);
  // free the strings in the array
  for (i = 0; i < tableInfosLen; ++i)
  {
    sqlite3_free(unionsArr[i]);
  }

  // compose the final query
#define TBL 0
#define PKS 1
#define NUM_COLS 2
#define COL_VRSNS 3
#define MIN_V 4
  return sqlite3_mprintf(
      "SELECT tbl, pks, num_cols, col_vrsns, min_v FROM (%z) ORDER BY min_v, tbl ASC",
      unionsStr);
  // %z frees unionsStr https://www.sqlite.org/printf.html#percentz
}

cfsql_ColumnInfo *cfsql_pickColumnInfosFromVersionMap(
    sqlite3 *db,
    cfsql_ColumnInfo *columnInfos,
    int columnInfosLen,
    int numVersionCols,
    const char *colVersions)
{
  if (numVersionCols > columnInfosLen) {
    return 0;
  }

  int rc = SQLITE_OK;
  char *zSql = sqlite3_mprintf("SELECT key as cid FROM json_each(?)");
  
  sqlite3_stmt *pStmt;
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK) {
    sqlite3_finalize(pStmt);
    return 0;
  }

  // This is safe, yea?
  // Binding the result of one statement to another.
  rc = sqlite3_bind_text(pStmt, 1, colVersions, -1, SQLITE_STATIC);
  if (rc != SQLITE_OK) {
    sqlite3_finalize(pStmt);
    return 0;
  }

  rc = sqlite3_step(pStmt);
  cfsql_ColumnInfo *ret = sqlite3_malloc(numVersionCols * sizeof *ret);
  int i = 0;
  while (rc == SQLITE_ROW) {

    int cid = sqlite3_column_int(pStmt, 0);
    if (cid >= columnInfosLen || i >= numVersionCols) {
      sqlite3_free(ret);
      sqlite3_finalize(pStmt);
      return 0;
    }
    ret[i] = columnInfos[cid];

    rc = sqlite3_step(pStmt);
    ++i;
  }

  if (i != numVersionCols) {
    sqlite3_free(ret);
    sqlite3_finalize(pStmt);
    return 0;
  }

  sqlite3_finalize(pStmt);
  return ret;
}

char *cfsql_rowPatchDataQuery(
    sqlite3 *db,
    cfsql_TableInfo *tblInfo,
    int numVersionCols,
    const char *colVrsns,
    const char *pks)
{
  char **pksArr = 0;
  if (tblInfo->pksLen == 1)
  {
    pksArr = sqlite3_malloc(1 * sizeof(char *));
    pksArr[0] = strdup(pks);
  }
  else
  {
    // split it up and assign
    pksArr = cfsql_split(pks, PK_DELIM, tblInfo->pksLen);
  }

  if (pksArr == 0)
  {
    return 0;
  }

  for (int i = 0; i < tblInfo->pksLen; ++i)
  {
    // this is safe since pks are extracted as `quote` in the prior queries
    // %z will de-allocate pksArr[i] so we can re-allocate it in the assignment
    pksArr[i] = sqlite3_mprintf("\"%s\" = %z", tblInfo->pks[i].name, pksArr[i]);
  }

  cfsql_ColumnInfo *changedCols = cfsql_pickColumnInfosFromVersionMap(
    db,
    tblInfo->baseCols,
    tblInfo->baseColsLen,
    numVersionCols,
    colVrsns
  );
  char *colsConcatList = cfsql_quoteConcat(changedCols, numVersionCols);
  sqlite3_free(changedCols);

  char *zSql = sqlite3_mprintf(
      "SELECT %z FROM \"%s\" WHERE %z",
      colsConcatList,
      tblInfo->tblName,
      // given identity is a pass-thru, pksArr will have its contents freed after calling this
      cfsql_join2((char *(*)(const char *)) & cfsql_identity, pksArr, tblInfo->pksLen, " AND "));

  // contents of pksArr was already freed via join2 and cfsql_identity. See above.
  sqlite3_free(pksArr);
  return zSql;
}

/*
** Advance a ChangesSince_cursor to its next row of output.
*/
static int changesSinceNext(sqlite3_vtab_cursor *cur)
{
  cfsql_ChangesSince_cursor *pCur = (cfsql_ChangesSince_cursor *)cur;
  int rc = SQLITE_OK;

  if (pCur->pChangesStmt == 0)
  {
    return SQLITE_ERROR;
  }

  if (pCur->pRowStmt != 0) {
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
    return changesSinceCrsrFinalize(pCur);
  }

  // else -- create row statement for the current row
  // fetch the data
  // pack it
  // finalize the row statement
  // fill our cursor
  // return
  const char *tbl = (const char *)sqlite3_column_text(pCur->pChangesStmt, TBL);
  const char *pks = (const char *)sqlite3_column_text(pCur->pChangesStmt, PKS);
  const char *colVrsns = (const char *)sqlite3_column_text(pCur->pChangesStmt, COL_VRSNS);
  int numCols = sqlite3_column_int(pCur->pChangesStmt, NUM_COLS);
  sqlite3_int64 minv = sqlite3_column_int64(pCur->pChangesStmt, MIN_V);

  if (numCols == 0) {
    changesSinceCrsrFinalize(pCur);
    return SQLITE_ERROR;
  }

  cfsql_TableInfo *tblInfo = cfsql_findTableInfo(pCur->tableInfos, pCur->tableInfosLen, tbl);
  if (tblInfo == 0)
  {
    changesSinceCrsrFinalize(pCur);
    return SQLITE_ERROR;
  }

  if (tblInfo->pksLen == 0)
  {
    // TODO set error msg
    // require pks in `cfsql_as_crr`
    return SQLITE_ERROR;
  }

  // TODO: handle delete patch case
  char *zSql = cfsql_rowPatchDataQuery(pCur->pTab->db, tblInfo, numCols, colVrsns, pks);
  if (zSql == 0)
  {
    // TODO set error msg
    return SQLITE_ERROR;
  }
  sqlite3_stmt *pRowStmt;
  rc = sqlite3_prepare_v2(pCur->pTab->db, zSql, -1, &pRowStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK) {
    sqlite3_finalize(pRowStmt);
    return rc;
  }

  rc = sqlite3_step(pRowStmt);
  if (rc != SQLITE_ROW) {
    sqlite3_finalize(pRowStmt);
    return SQLITE_ERROR;
  } else {
    rc = SQLITE_OK;
  }

  // pCur->colVals = strdup(sqlite3_column_text(pRowStmt, 0));
  pCur->pRowStmt = pRowStmt;
  pCur->colVrsns = colVrsns;
  pCur->version = minv;

  return rc;
}

/*
** Return values of columns for the row at which the templatevtab_cursor
** is currently pointing.
*/
static int changesSinceColumn(
    sqlite3_vtab_cursor *cur, /* The cursor */
    sqlite3_context *ctx,     /* First argument to sqlite3_result_...() */
    int i                     /* Which column to return */
)
{
  cfsql_ChangesSince_cursor *pCur = (cfsql_ChangesSince_cursor *)cur;
  // TODO: in the future, return a protobuf.
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
  default:
    return SQLITE_ERROR;
  }
  // sqlite3_result_value(ctx, sqlite3_column_value(pCur->pRowStmt, i));
  return SQLITE_OK;
}

/*
** This method is called to "rewind" the templatevtab_cursor object back
** to the first row of output.  This method is always called at least
** once prior to any call to templatevtabColumn() or templatevtabRowid() or
** templatevtabEof().
*/
static int changesSinceFilter(
    sqlite3_vtab_cursor *pVtabCursor,
    int idxNum, const char *idxStr,
    int argc, sqlite3_value **argv)
{
  int rc = SQLITE_OK;
  cfsql_ChangesSince_cursor *pCrsr = (cfsql_ChangesSince_cursor *)pVtabCursor;
  cfsql_ChangesSince_vtab *pTab = pCrsr->pTab;
  sqlite3 *db = pTab->db;
  char **rClockTableNames = 0;
  int rNumRows = 0;
  int rNumCols = 0;
  char *err = 0;

  if (pCrsr->pChangesStmt)
  {
    sqlite3_finalize(pCrsr->pChangesStmt);
    pCrsr->pChangesStmt = 0;
  }

  // Find all clock tables
  rc = sqlite3_get_table(
      db,
      CLOCK_TABLES_SELECT,
      &rClockTableNames,
      &rNumRows,
      &rNumCols,
      0);

  if (rc != SQLITE_OK || rNumRows == 0)
  {
    sqlite3_free_table(rClockTableNames);
    return rc;
  }

  // construct table infos for each table
  // we'll need to attach these table infos
  // to our cursor
  // TODO: we should preclude index info from them
  cfsql_TableInfo **tableInfos = sqlite3_malloc(rNumRows * sizeof(cfsql_TableInfo *));
  memset(tableInfos, 0, rNumRows * sizeof(cfsql_TableInfo *));
  for (int i = 0; i < rNumRows; ++i)
  {
    // Strip __cfsql_clock suffix.
    // +1 since tableNames includes a row for column headers
    char *baseTableName = strndup(rClockTableNames[i + 1], strlen(rClockTableNames[i + 1]) - __CFSQL_CLOCK_LEN);
    rc = cfsql_getTableInfo(db, baseTableName, &tableInfos[i], &err);
    sqlite3_free(baseTableName);

    if (rc != SQLITE_OK)
    {
      cfsql_freeAllTableInfos(tableInfos, rNumRows);
      sqlite3_free(err);
      return rc;
    }
  }

  sqlite3_free_table(rClockTableNames);

  // now construct and prepare our union for fetching changes
  char *zSql = cfsql_changesUnionQuery(tableInfos, rNumRows);

  if (zSql == 0)
  {
    cfsql_freeAllTableInfos(tableInfos, rNumRows);
    return SQLITE_ERROR;
  }

  sqlite3_stmt *pStmt = 0;
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  if (rc != SQLITE_OK)
  {
    cfsql_freeAllTableInfos(tableInfos, rNumRows);
    sqlite3_finalize(pStmt);
    return rc;
  }

  // pull user provided params to `getChangesSince`
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
  for (i = 0; i < rNumRows; ++i)
  {
    sqlite3_bind_blob(pStmt, j++, requestorSiteId, requestorSiteIdLen, SQLITE_STATIC);
    sqlite3_bind_int64(pStmt, j++, versionBound);
  }

  // put table infos into our cursor for later use on row fetches
  pCrsr->tableInfos = tableInfos;
  pCrsr->tableInfosLen = rNumRows;
  pCrsr->pChangesStmt = pStmt;

  return changesSinceNext((sqlite3_vtab_cursor *)pCrsr);

  // return SQLITE_OK;
}

/*
** SQLite will invoke this method one or more times while planning a query
** that uses the virtual table.  This routine needs to create
** a query plan for each invocation and compute an estimated cost for that
** plan.
*/
static int changesSinceBestIndex(
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
        return SQLITE_CONSTRAINT;
      }
      versionIdx = i;
      idxNum |= 2;
      break;
    case CHANGES_SINCE_VTAB_RQSTR:
      if (pConstraint->op != SQLITE_INDEX_CONSTRAINT_EQ)
      {
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

sqlite3_module cfsql_changesSinceModule = {
    /* iVersion    */ 0,
    /* xCreate     */ 0,
    /* xConnect    */ changesSinceConnect,
    /* xBestIndex  */ changesSinceBestIndex,
    /* xDisconnect */ changesSinceDisconnect,
    /* xDestroy    */ 0,
    /* xOpen       */ changesSinceOpen,
    /* xClose      */ changesSinceClose,
    /* xFilter     */ changesSinceFilter,
    /* xNext       */ changesSinceNext,
    /* xEof        */ changesSinceEof,
    /* xColumn     */ changesSinceColumn,
    /* xRowid      */ changesSinceRowid,
    /* xUpdate     */ 0,
    /* xBegin      */ 0,
    /* xSync       */ 0,
    /* xCommit     */ 0,
    /* xRollback   */ 0,
    /* xFindMethod */ 0,
    /* xRename     */ 0,
    /* xSavepoint  */ 0,
    /* xRelease    */ 0,
    /* xRollbackTo */ 0,
    /* xShadowName */ 0};
