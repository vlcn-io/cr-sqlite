#include "changes-vtab.h"
#include <string.h>
#include <assert.h>
#include "consts.h"
#include "util.h"

/**
 * vtab `changes since` usage:
 * SELECT * FROM crsql_chages WHERE site_id != SITE_ID AND version > V
 *
 * returns:
 * table_name, quote-concated pks ~'~, json-encoded vals, json-encoded versions, curr version
 *
 * vtab `apply changes` usage:
 * insert into crsql_changes table, pks, colvals, colversions, site_id VALUES(...)
 * ^-- don't technically need a where.. maybe never even do a where
 * given `pks`, `table` are our where.
 * ^-- only allow inserts, never updates.
 *
 */

typedef struct crsql_Changes_vtab crsql_Changes_vtab;
struct crsql_Changes_vtab
{
  sqlite3_vtab base; /* Base class - must be first */
  sqlite3 *db;
};

/* A subclass of sqlite3_vtab_cursor which will
** serve as the underlying representation of a cursor that scans
** over rows of the result
*/
typedef struct crsql_Changes_cursor crsql_Changes_cursor;
struct crsql_Changes_cursor
{
  sqlite3_vtab_cursor base; /* Base class - must be first */

  crsql_Changes_vtab *pTab;
  crsql_TableInfo **tableInfos;
  int tableInfosLen;

  // The statement that is returning the identifiers
  // of what has changed
  sqlite3_stmt *pChangesStmt;
  sqlite3_stmt *pRowStmt;

  const char *colVrsns;
  sqlite3_int64 version;
};

/*
** The changesVtabConnect() method is invoked to create a new
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
  // TODO: ^-- change rqstr to site_id and make query != site_id
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
** Destructor for Changes_vtab objects
*/
static int changesDisconnect(sqlite3_vtab *pVtab)
{
  crsql_Changes_vtab *p = (crsql_Changes_vtab *)pVtab;
  sqlite3_free(p);
  return SQLITE_OK;
}

/*
** Constructor for a new Changes cursors object.
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
  // since we can get into this twice for the same object.
  int rc = SQLITE_OK;
  rc += sqlite3_finalize(crsr->pChangesStmt);
  crsr->pChangesStmt = 0;
  rc += sqlite3_finalize(crsr->pRowStmt);
  crsr->pRowStmt = 0;
  crsql_freeAllTableInfos(crsr->tableInfos, crsr->tableInfosLen);
  crsr->tableInfos = 0;
  crsr->tableInfosLen = 0;

  // do not free colVrsns as it is a reference
  // to the data from the pChangesStmt
  // and is thus managed by that statement
  crsr->colVrsns = 0;

  return rc;
}

/*
** Destructor for a Changes cursor.
*/
static int changesClose(sqlite3_vtab_cursor *cur)
{
  crsql_Changes_cursor *pCur = (crsql_Changes_cursor *)cur;
  changesCrsrFinalize(pCur);
  sqlite3_free(pCur);
  return SQLITE_OK;
}

/*
** Return the rowid for the current row.
*/
static int changesRowid(sqlite3_vtab_cursor *cur, sqlite_int64 *pRowid)
{
  crsql_Changes_cursor *pCur = (crsql_Changes_cursor *)cur;
  *pRowid = pCur->version;
  return SQLITE_OK;
}

/*
** Return TRUE if the cursor has been moved off of the last
** row of output.
*/
static int changesEof(sqlite3_vtab_cursor *cur)
{
  crsql_Changes_cursor *pCur = (crsql_Changes_cursor *)cur;
  return pCur->pChangesStmt == 0;
}

char *crsql_changesQueryForTable(crsql_TableInfo *tableInfo)
{
  if (tableInfo->pksLen == 0)
  {
    return 0;
  }

  char *zSql = sqlite3_mprintf(
      "SELECT\
      %z as pks,\
      '%s' as tbl,\
      json_group_object(__crsql_col_num, __crsql_version) as col_vrsns,\
      count(__crsql_col_num) as num_cols,\
      min(__crsql_version) as min_v\
    FROM \"%s__crsql_clock\"\
    WHERE\
      __crsql_site_id != ?\
    AND\
      __crsql_version > ?\
    GROUP BY pks",
      crsql_quoteConcat(tableInfo->pks, tableInfo->pksLen),
      tableInfo->tblName,
      tableInfo->tblName);

  return zSql;
}

char *crsql_changesUnionQuery(
    crsql_TableInfo **tableInfos,
    int tableInfosLen)
{
  char *unionsArr[tableInfosLen];
  char *unionsStr = 0;
  int i = 0;

  for (i = 0; i < tableInfosLen; ++i)
  {
    unionsArr[i] = crsql_changesQueryForTable(tableInfos[i]);
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
  unionsStr = crsql_join(unionsArr, tableInfosLen);
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

crsql_ColumnInfo *crsql_pickColumnInfosFromVersionMap(
    sqlite3 *db,
    crsql_ColumnInfo *columnInfos,
    int columnInfosLen,
    int numVersionCols,
    const char *colVersions)
{
  if (numVersionCols > columnInfosLen)
  {
    return 0;
  }

  int rc = SQLITE_OK;
  char *zSql = sqlite3_mprintf("SELECT key as cid FROM json_each(?)");

  sqlite3_stmt *pStmt;
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    sqlite3_finalize(pStmt);
    return 0;
  }

  // This is safe, yea?
  // Binding the result of one statement to another.
  rc = sqlite3_bind_text(pStmt, 1, colVersions, -1, SQLITE_STATIC);
  if (rc != SQLITE_OK)
  {
    sqlite3_finalize(pStmt);
    return 0;
  }

  rc = sqlite3_step(pStmt);
  crsql_ColumnInfo *ret = sqlite3_malloc(numVersionCols * sizeof *ret);
  int i = 0;
  while (rc == SQLITE_ROW)
  {

    int cid = sqlite3_column_int(pStmt, 0);
    if (cid >= columnInfosLen || i >= numVersionCols)
    {
      sqlite3_free(ret);
      sqlite3_finalize(pStmt);
      return 0;
    }
    ret[i] = columnInfos[cid];

    rc = sqlite3_step(pStmt);
    ++i;
  }

  if (i != numVersionCols)
  {
    sqlite3_free(ret);
    sqlite3_finalize(pStmt);
    return 0;
  }

  sqlite3_finalize(pStmt);
  return ret;
}

char *crsql_rowPatchDataQuery(
    sqlite3 *db,
    crsql_TableInfo *tblInfo,
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
    pksArr = crsql_split(pks, PK_DELIM, tblInfo->pksLen);
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

  crsql_ColumnInfo *changedCols = crsql_pickColumnInfosFromVersionMap(
      db,
      tblInfo->baseCols,
      tblInfo->baseColsLen,
      numVersionCols,
      colVrsns);
  char *colsConcatList = crsql_quoteConcat(changedCols, numVersionCols);
  sqlite3_free(changedCols);

  char *zSql = sqlite3_mprintf(
      "SELECT %z FROM \"%s\" WHERE %z",
      colsConcatList,
      tblInfo->tblName,
      // given identity is a pass-thru, pksArr will have its contents freed after calling this
      crsql_join2((char *(*)(const char *)) & crsql_identity, pksArr, tblInfo->pksLen, " AND "));

  // contents of pksArr was already freed via join2 and crsql_identity. See above.
  sqlite3_free(pksArr);
  return zSql;
}

/*
** Advance a Changes_cursor to its next row of output.
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

  crsql_TableInfo *tblInfo = crsql_findTableInfo(pCur->tableInfos, pCur->tableInfosLen, tbl);
  if (tblInfo == 0)
  {
    pTabBase->zErrMsg = sqlite3_mprintf("crsql internal error. Could not find schema for table %s", tbl);
    changesCrsrFinalize(pCur);
    return SQLITE_ERROR;
  }

  if (tblInfo->pksLen == 0)
  {
    // TODO set error msg
    // require pks in `crsql_as_crr`
    crsql_freeTableInfo(tblInfo);
    pTabBase->zErrMsg = sqlite3_mprintf("crr table %s is missing primary key columns", tblInfo->tblName);
    return SQLITE_ERROR;
  }

  // TODO: handle delete patch case
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

  // TODO: handle the row delete case. There will be now row to fetch in that case.
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

/*
** Return values of columns for the row at which the templatevtab_cursor
** is currently pointing.
*/
static int changesColumn(
    sqlite3_vtab_cursor *cur, /* The cursor */
    sqlite3_context *ctx,     /* First argument to sqlite3_result_...() */
    int i                     /* Which column to return */
)
{
  crsql_Changes_cursor *pCur = (crsql_Changes_cursor *)cur;
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
    pTabBase->zErrMsg = sqlite3_mprintf("crsql internal error discovering crr tables.");
    sqlite3_free_table(rClockTableNames);
    return rc;
  }

  // construct table infos for each table
  // we'll need to attach these table infos
  // to our cursor
  // TODO: we should preclude index info from them
  crsql_TableInfo **tableInfos = sqlite3_malloc(rNumRows * sizeof(crsql_TableInfo *));
  memset(tableInfos, 0, rNumRows * sizeof(crsql_TableInfo *));
  for (int i = 0; i < rNumRows; ++i)
  {
    // Strip __crsql_clock suffix.
    // +1 since tableNames includes a row for column headers
    char *baseTableName = strndup(rClockTableNames[i + 1], strlen(rClockTableNames[i + 1]) - __CRSQL_CLOCK_LEN);
    rc = crsql_getTableInfo(db, baseTableName, &tableInfos[i], &err);
    sqlite3_free(baseTableName);

    if (rc != SQLITE_OK)
    {
      pTabBase->zErrMsg = sqlite3_mprintf("crsql internal error getting schemas for crr tables.");
      crsql_freeAllTableInfos(tableInfos, rNumRows);
      sqlite3_free(err);
      return rc;
    }
  }

  sqlite3_free_table(rClockTableNames);

  // now construct and prepare our union for fetching changes
  char *zSql = crsql_changesUnionQuery(tableInfos, rNumRows);

  if (zSql == 0)
  {
    pTabBase->zErrMsg = sqlite3_mprintf("crsql internal error generating the query to extract changes.");
    crsql_freeAllTableInfos(tableInfos, rNumRows);
    return SQLITE_ERROR;
  }

  sqlite3_stmt *pStmt = 0;
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  if (rc != SQLITE_OK)
  {
    pTabBase->zErrMsg = sqlite3_mprintf("crsql internal error preparing the statement to extract changes.");
    crsql_freeAllTableInfos(tableInfos, rNumRows);
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
  for (i = 0; i < rNumRows; ++i)
  {
    sqlite3_bind_blob(pStmt, j++, requestorSiteId, requestorSiteIdLen, SQLITE_STATIC);
    sqlite3_bind_int64(pStmt, j++, versionBound);
  }

  // put table infos into our cursor for later use on row fetches
  pCrsr->tableInfos = tableInfos;
  pCrsr->tableInfosLen = rNumRows;
  pCrsr->pChangesStmt = pStmt;

  return changesNext((sqlite3_vtab_cursor *)pCrsr);

  // return SQLITE_OK;
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
  // TODO: require both params?
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

int crsql_mergeDelete()
{
  // argv[0] is the primary key of the thing to delete
  // this is a bit problematic... as we need the pks and table rather than the version.
  // we could change the pk to be pk and table concated...
  // or we can preclude explicit deletes and do the delete on insert

  // TODO: should we accept an actual delete statement or..
  // understand an insert could be a delete post merge?
  return SQLITE_OK;
}

int crsql_mergeInsert(
    sqlite3_vtab *pVTab,
    int argc,
    sqlite3_value **argv,
    sqlite_int64 *pRowid)
{
  // he argv[1] parameter is the rowid of a new row to be inserted into the virtual table.
  // If argv[1] is an SQL NULL, then the implementation must choose a rowid for the newly inserted row
  int rowidType = sqlite3_value_type(argv[1]);

  // column values exist in argv[2] and following.
  const unsigned char * insertTbl = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_TBL]);
  const unsigned char * insertPks = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_PK]);
  const unsigned char * insertVals = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_COL_VALS]);
  const unsigned char * insertColVrsns = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_COL_VRSNS]);
  // sqlite3_int64 insertVrsn = sqlite3_value_int64(argv[2 + CHANGES_SINCE_VTAB_VRSN]);
  int insertSiteIdLen = sqlite3_value_bytes(argv[2 + CHANGES_SINCE_VTAB_SITE_ID]);
  const const char * insertSiteId = sqlite3_value_blob(argv[2 + CHANGES_SINCE_VTAB_SITE_ID]);

  // Algorithm:
  // 0. toggle `crsql_insert_src` to `sync`
  // 1. start a transaction? Or should we assume caller has done that?
  // 2. pick cids _and_ versions from col_versions
  // 3. fetch corresponding col version entries from clock table for the table
  // 4. only take the ones where patch_version > local_version or patch_version = local_version and remote_site > local_site
  // 5. construct new insert statement against base table
  //   nit: how will you prevent the trigger(s) from running?
  //   need to register a new function that has a user data arg which we can toggle to
  //   tell us the source of the insert. safe given sqlite connections must be accessed from 1 and only 1 thread.
  // 6. apply insert to base table. `on conflict update` the new columns.

  // Steps (2) & (3) & (4):
  // If remote_site < local_site:
  // select cid, version from json_each(col_versions) left join x_clock WHERE pkWhereList AND version > x_clock.version
  // If remote_site > local_site:
  // select cid, version from json_each(col_versions) left join x_clock WHERE pkWhereList AND version >= x_clock.version
  // pkWhereList:
  // x_clock.pk1 = lit_pk1 AND x_clock.pk2 = list_pk2 etc.
  // `lit_pk1` etc are escaped for inclusion directly in the string given they are quote-concated
  // LEFT JOIN since that'll give us results even if the local has no clock table entries for those columns.

  // Given `cids`, pull `columInfos` (they're indexed by cid already)
  // INSERT INTO tbl (asIdentifierList(columnInfos)) VALUES (extracted-values)
  
  // extracted-values:
  // we need to map back from cids to values indices...
  // extracted-values are indexed by colVersions.
  // SELECT cid FROM json_each(col_versions);
  // patchVales = []
  // for i = 0; i < cids.len; ++i {
  //   if (cid in patchable_cids) {
  //     patchVals.push(vals[i])
  //   }
  // }


  // sqlite is going to somehow provide us with a rowid.
  // TODO: how in the world does it know the rowid of a vtab?
  // unless it runs a query all against our vtab... which I hope not.

  // implementation must set *pRowid to the rowid of the newly inserted row
  // if argv[1] is an SQL NULL
  // sqlite3_value_type(argv[i])==SQLITE_NULL
  return SQLITE_OK;
}

int applyRowPatch(
    sqlite3_vtab *pVTab,
    int argc,
    sqlite3_value **argv,
    sqlite_int64 *pRowid)
{
  int argv0Type = sqlite3_value_type(argv[0]);
  // if (argc == 1 && argv[0] != 0)
  // {
  //   // delete statement
  //   return crsql_mergeDelete();
  // }
  if (argc > 1 && argv0Type == SQLITE_NULL)
  {
    // insert statement
    // argv[1] is the rowid.. but why would it ever be filled for us?
    return crsql_mergeInsert(pVTab, argc, argv, pRowid);
  }
  else
  {
    pVTab->zErrMsg = sqlite3_mprintf("Only INSERT statements are allowed against the crsql changes table.");
    return SQLITE_MISUSE;
  }

  return SQLITE_OK;
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
    /* xUpdate     */ applyRowPatch,
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
