#include "changes-vtab-read.h"
#include "consts.h"
#include "util.h"

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
  crsql_ColumnInfo *changedCols = crsql_pickColumnInfosFromVersionMap(
      db,
      tblInfo->baseCols,
      tblInfo->baseColsLen,
      numVersionCols,
      colVrsns);
  char *colsConcatList = crsql_quoteConcat(changedCols, numVersionCols);
  sqlite3_free(changedCols);

  char *pkWhereList = crsql_extractWhereList(tblInfo->pks, tblInfo->pksLen, pks);
  char *zSql = sqlite3_mprintf(
      "SELECT %z FROM \"%s\" WHERE %z",
      colsConcatList,
      tblInfo->tblName,
      pkWhereList);

  return zSql;
}