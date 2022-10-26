/**
 * The changes virtual table is an eponymous virtual table which can be used
 * to fetch and apply patches to a db.
 * 
 * To fetch a changeset:
 * ```sql
 * SELECT * FROM crsql_chages WHERE site_id != SITE_ID AND version > V
 * ```
 * 
 * The site id parameter is used to prevent a site from fetching its own changes that were
 * patched into the remote.
 * 
 * The version parameter is used to get changes after a specific version.
 * Sites should keep track of the latest version they've received from other sites
 * and use that number as a cursor to fetch future changes.
 *
 * The changes table has the following columns:
 * 1. table - the name of the table the patch is from
 * 2. pk - the primary key(s) that identify the row to be patched. If the
 *    table has many columns that comprise the primary key then
 *    the values are quote concatenated in pk order.
 * 3. col_vals - the values to patch. quote concatenated in cid order.
 * 4. col_versions - the cids of the changed columns and the versions of those columns
 * 5. version - the min version of the patch. Used for filtering and for sites to update their
 *    "last seen" version from other sites
 * 6. site_id - the site_id that is responsible for the update. If this is 0
 *    then the update was made locally.
 * 
 * To apply a changeset:
 * ```sql
 * INSERT INTO changes (table, pk, col_vals, col_versions, site_id) VALUES (...)
 * ```
 */

#include "changes-vtab.h"
#include <string.h>
#include <assert.h>
#include "consts.h"
#include "util.h"

/**
 * Data maintained by the virtual table across
 * queries.
 * 
 * Per-query data is kept on crsql_Changes_cursor
 * 
 * All table infos are fetched on vtab initialization.
 * This creates the constraint that if the schema of a crr
 * is modified after the virtual table definition is loaded
 * then it will not be or not be correctly processed
 * by the virtual table.
 * 
 * Given that, if a schema modification is made
 * to a crr table then the changes vtab needs to be 
 * reloaded.
 * 
 * The simpleset way to accomplish this is to close
 * and re-open the connection responsible for syncing.
 * 
 * In practice this should generally not be a problem
 * as application startup would establish, migrated, etc. the schemas
 * after which a sync process would connect.
 */
typedef struct crsql_Changes_vtab crsql_Changes_vtab;
struct crsql_Changes_vtab
{
  sqlite3_vtab base;
  sqlite3 *db;

  crsql_TableInfo **tableInfos;
  int tableInfosLen;
};

/**
 * Cursor used to return patches.
 * This is instantiated per-query and updated
 * on each row being returned.
 * 
 * Contains a reference to the vtab structure in order
 * get a handle on the db which to fetch from
 * the underlying crr tables.
 * 
 * Most columns are passed-through from
 * `pChangesStmt` and `pRowStmt` which are stepped
 * in each call to `changesNext`.
 * 
 * `colVersion` is copied given it is unclear
 * what the behavior is of calling `sqlite3_column_x` on
 * the same column multiple times with, potentially,
 * different types.
 * 
 * `colVersions` is used in the implementation as
 * a text column in order to fetch the correct columns
 * from the physical row.
 * 
 * Everything allocated here must be constructed in
 * changesOpen and released in changesCrsrFinalize
 */
typedef struct crsql_Changes_cursor crsql_Changes_cursor;
struct crsql_Changes_cursor
{
  sqlite3_vtab_cursor base;

  crsql_Changes_vtab *pTab;

  sqlite3_stmt *pChangesStmt;
  sqlite3_stmt *pRowStmt;

  const char *colVrsns;
  sqlite3_int64 version;
};

/**
 * Pulls all table infos for all crrs present in the database.
 * Run once at vtab initialization -- see docs on crsql_Changes_vtab
 * for the constraints this creates.
 */
int crsql_pullAllTableInfos(
    sqlite3 *db,
    crsql_TableInfo ***pzpTableInfos,
    int *rTableInfosLen,
    char **errmsg)
{
  char **zzClockTableNames = 0;
  int rNumCols = 0;
  int rNumRows = 0;
  int rc = SQLITE_OK;

  // Find all clock tables
  rc = sqlite3_get_table(
      db,
      CLOCK_TABLES_SELECT,
      &zzClockTableNames,
      &rNumRows,
      &rNumCols,
      0);

  if (rc != SQLITE_OK || rNumRows == 0)
  {
    *errmsg = sqlite3_mprintf("crsql internal error discovering crr tables.");
    sqlite3_free_table(zzClockTableNames);
    return SQLITE_ERROR;
  }

  // TODO: validate index info
  crsql_TableInfo **tableInfos = sqlite3_malloc(rNumRows * sizeof(crsql_TableInfo *));
  memset(tableInfos, 0, rNumRows * sizeof(crsql_TableInfo *));
  for (int i = 0; i < rNumRows; ++i)
  {
    // +1 since tableNames includes a row for column headers
    // Strip __crsql_clock suffix.
    char *baseTableName = strndup(zzClockTableNames[i + 1], strlen(zzClockTableNames[i + 1]) - __CRSQL_CLOCK_LEN);
    rc = crsql_getTableInfo(db, baseTableName, &tableInfos[i], errmsg);
    sqlite3_free(baseTableName);

    if (rc != SQLITE_OK)
    {
      sqlite3_free_table(zzClockTableNames);
      crsql_freeAllTableInfos(tableInfos, rNumRows);
      return rc;
    }
  }

  sqlite3_free_table(zzClockTableNames);

  *pzpTableInfos = tableInfos;
  *rTableInfosLen = rNumRows;

  return SQLITE_OK;
}

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

  rc = crsql_pullAllTableInfos(db, &(pNew->tableInfos), &(pNew->tableInfosLen), &(*ppVtab)->zErrMsg);
  if (rc != SQLITE_OK) {
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

/**
 * Construct the query to grab the changes made against
 * rows in a given table
 */
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

/**
 * Union all the crr tables together to get a comprehensive
 * set of changes
 */
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

/**
 * Pull the column infos that represent the cids in
 * the version map.
 */
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

  sqlite3_stmt *pStmt = 0;
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
  sqlite3_finalize(pStmt);

  if (i != numVersionCols)
  {
    sqlite3_free(ret);
    return 0;
  }

  return ret;
}

/**
 * Create the query to pull the backing data from the actual row based
 * on the version mape of changed columns.
 * 
 * This pulls all columns that have changed from the row.
 * The values of the columns are quote-concated for compliance
 * with union query constraints. I.e., that all tables must have same
 * output number of columns.
 * 
 * TODO: potential improvement would be to store a binary
 * representation of the data via flat buffers.
 * 
 * This will fill pRowStmt in the cursor.
 * 
 * TODO: We could theoretically prepare all of these queries up 
 * front on vtab initialization so we don't have to
 * re-compile them for each row fetched.
 */
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

int crsql_mergeInsert(
    sqlite3_vtab *pVTab,
    int argc,
    sqlite3_value **argv,
    sqlite_int64 *pRowid,
    char **errmsg)
{
  // he argv[1] parameter is the rowid of a new row to be inserted into the virtual table.
  // If argv[1] is an SQL NULL, then the implementation must choose a rowid for the newly inserted row
  int rowidType = sqlite3_value_type(argv[1]);
  int rc = 0;
  crsql_Changes_vtab *pTab = (crsql_Changes_vtab *)pVTab;
  sqlite3 *db = pTab->db;
  char *zSql = 0;
  char **cidsAndVersions = 0;
  int numChangedCols = 0;
  int ignore = 0;

  // column values exist in argv[2] and following.
  const unsigned char *insertTbl = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_TBL]);
  const unsigned char *insertPks = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_PK]);
  const unsigned char *insertVals = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_COL_VALS]);
  const unsigned char *insertColVrsns = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_COL_VRSNS]);
  // sqlite3_int64 insertVrsn = sqlite3_value_int64(argv[2 + CHANGES_SINCE_VTAB_VRSN]);
  int insertSiteIdLen = sqlite3_value_bytes(argv[2 + CHANGES_SINCE_VTAB_SITE_ID]);
  const char *insertSiteId = sqlite3_value_blob(argv[2 + CHANGES_SINCE_VTAB_SITE_ID]);

  rc = sqlite3_exec(db, SET_SYNC_BIT, 0, 0, errmsg);
  if (rc != SQLITE_OK)
  {
    // try to revert the sync bit -- although it should not have taken
    // if the above failed anyway
    sqlite3_exec(db, CLEAR_SYNC_BIT, 0, 0, 0);
    return rc;
  }

  zSql = sqlite3_mprintf("SELECT key as cid, value as version FROM json_each(%Q)", insertColVrsns);
  rc = sqlite3_get_table(db, zSql, &cidsAndVersions, &numChangedCols, &ignore, errmsg);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK || numChangedCols == 0)
  {
    sqlite3_exec(db, CLEAR_SYNC_BIT, 0, 0, 0);
    sqlite3_free_table(cidsAndVersions);
    return rc;
  }

  // construct table info for given table...
  // can we cache it? we don't want to reconstruct for every row...
  // or just pull table infos into vtab
  // and require users of the vtab to not connect their syncing until _after_
  // all schema changes have been made. Or destroy and re-create connection
  // if schema changes are made.

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

int changesApply(
    sqlite3_vtab *pVTab,
    int argc,
    sqlite3_value **argv,
    sqlite_int64 *pRowid)
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
