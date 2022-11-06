#include "tableinfo.h"
#include "crsqlite.h"
#include "util.h"
#include "consts.h"
#include "get-table.h"

#include <ctype.h>
#include <string.h>
#include <stdlib.h>
#include <assert.h>
#include <stdio.h>

// Bug here? see crsql_asIdentifierListStr
char *crsql_asIdentifierList(crsql_ColumnInfo *in, size_t inlen, char *prefix)
{
  if (inlen <= 0)
  {
    return 0;
  }

  char **mapped = sqlite3_malloc(inlen * sizeof(char *));
  int finalLen = 0;
  char *ret = 0;

  for (size_t i = 0; i < inlen; ++i)
  {
    mapped[i] = sqlite3_mprintf("%s\"%w\"", prefix, in[i].name);
    finalLen += strlen(mapped[i]);
  }
  // -1 for spearator not appended to last thing
  finalLen += inlen - 1;

  // + 1 for null terminator
  ret = sqlite3_malloc(finalLen * sizeof(char) + 1);
  ret[finalLen] = '\0';

  crsql_joinWith(ret, mapped, inlen, ',');

  // free everything we allocated, except ret.
  // caller will free ret.
  for (size_t i = 0; i < inlen; ++i)
  {
    sqlite3_free(mapped[i]);
  }
  sqlite3_free(mapped);

  return ret;
}

void crsql_freeColumnInfoContents(crsql_ColumnInfo *columnInfo)
{
  sqlite3_free(columnInfo->name);
  if (columnInfo->versionOf == 0)
  {
    // if versionOf is set then type points to a literal
    sqlite3_free(columnInfo->type);
  }

  // we do not free versionOf since versionOf points to a name
  // of another column which will have been freed when
  // that column is freed.
  // sqlite3_free(columnInfo->versionOf);
}

void crsql_freeIndexInfoContents(crsql_IndexInfo *indexInfo)
{
  sqlite3_free(indexInfo->name);
  sqlite3_free(indexInfo->origin);
  for (int j = 0; j < indexInfo->indexedColsLen; ++j)
  {
    sqlite3_free(indexInfo->indexedCols[j]);
  }
  sqlite3_free(indexInfo->indexedCols);
}

void crsql_freeIndexInfos(crsql_IndexInfo *indexInfos, int indexInfosLen)
{
  if (indexInfos == 0)
  {
    return;
  }

  for (int i = 0; i < indexInfosLen; ++i)
  {
    crsql_freeIndexInfoContents(&indexInfos[i]);
  }

  sqlite3_free(indexInfos);
}


static char *quote(const char *in)
{
  return sqlite3_mprintf("quote(\"%s\")", in);
}

char *crsql_quoteConcat(crsql_ColumnInfo * cols, int len) {
  char *names[len];
  for (int i = 0; i < len; ++i)
  {
    names[i] = cols[i].name;
  }

  return crsql_join2(&quote, names, len, " || '~''~' || ");
}

static void crsql_freeColumnInfos(crsql_ColumnInfo *columnInfos, int len)
{
  if (columnInfos == 0)
  {
    return;
  }

  int i = 0;
  for (i = 0; i < len; ++i)
  {
    crsql_freeColumnInfoContents(&columnInfos[i]);
  }

  sqlite3_free(columnInfos);
}

crsql_ColumnInfo *crsql_extractBaseCols(
    crsql_ColumnInfo *colInfos,
    int colInfosLen,
    int *pBaseColsLen)
{
  int i = 0;
  int j = 0;
  int numBaseCols = 0;
  crsql_ColumnInfo *ret = 0;

  for (i = 0; i < colInfosLen; ++i)
  {
    if (colInfos[i].versionOf == 0)
    {
      ++numBaseCols;
    }
  }

  *pBaseColsLen = numBaseCols;
  ret = sqlite3_malloc(numBaseCols * sizeof *ret);

  for (i = 0; i < colInfosLen; ++i)
  {
    if (colInfos[i].versionOf == 0)
    {
      assert(j < numBaseCols);
      ret[j] = colInfos[i];
      ++j;
    }
  }

  return ret;
}

int crsql_numPks(
    crsql_ColumnInfo *colInfos,
    int colInfosLen)
{
  int ret = 0;
  int i = 0;

  for (i = 0; i < colInfosLen; ++i)
  {
    if (colInfos[i].pk > 0)
    {
      ++ret;
    }
  }

  return ret;
}

static int cmpPks(const void *a, const void *b)
{
  return (((crsql_ColumnInfo *)a)->pk - ((crsql_ColumnInfo *)b)->pk);
}

crsql_ColumnInfo *crsql_pks(crsql_ColumnInfo *colInfos,
                            int colInfosLen,
                            int *pPksLen)
{
  int numPks = crsql_numPks(colInfos, colInfosLen);
  crsql_ColumnInfo *ret = 0;
  int i = 0;
  int j = 0;
  *pPksLen = numPks;

  if (numPks == 0)
  {
    return 0;
  }

  ret = sqlite3_malloc(numPks * sizeof *ret);
  for (i = 0; i < colInfosLen; ++i)
  {
    if (colInfos[i].pk > 0)
    {
      assert(j < numPks);
      ret[j] = colInfos[i];
      ++j;
    }
  }

  qsort(ret, numPks, sizeof(crsql_ColumnInfo), cmpPks);

  assert(j == numPks);
  return ret;
}

crsql_ColumnInfo *crsql_nonPks(crsql_ColumnInfo *colInfos,
                               int colInfosLen,
                               int *pNonPksLen)
{
  int nonPksLen = colInfosLen - crsql_numPks(colInfos, colInfosLen);
  crsql_ColumnInfo *ret = 0;
  int i = 0;
  int j = 0;
  *pNonPksLen = nonPksLen;

  if (nonPksLen == 0)
  {
    return 0;
  }

  ret = sqlite3_malloc(nonPksLen * sizeof *ret);
  for (i = 0; i < colInfosLen; ++i)
  {
    if (colInfos[i].pk == 0)
    {
      assert(j < nonPksLen);
      ret[j] = colInfos[i];
      ++j;
    }
  }

  assert(j == nonPksLen);
  return ret;
}

/**
 * Constructs a table info based on the results of pragma
 * statements against the base table.
 */
static crsql_TableInfo *crsql_tableInfo(
    const char *tblName,
    crsql_ColumnInfo *colInfos,
    int colInfosLen,
    crsql_IndexInfo *indexInfos,
    int indexInfosLen)
{
  crsql_TableInfo *ret = sqlite3_malloc(sizeof *ret);

  ret->baseCols = colInfos;
  ret->baseColsLen = colInfosLen;

  ret->tblName = strdup(tblName);

  ret->nonPks = crsql_nonPks(ret->baseCols, ret->baseColsLen, &(ret->nonPksLen));
  ret->pks = crsql_pks(ret->baseCols, ret->baseColsLen, &(ret->pksLen));
  ret->indexInfo = indexInfos;
  ret->indexInfoLen = indexInfosLen;

  return ret;
}

/**
 * Given a table, return (into pIndexInfo) all the
 * indices for that table and the columns indexed.
 */
int crsql_getIndexList(
    sqlite3 *db,
    const char *tblName,
    crsql_IndexInfo **pIndexInfos,
    int *pIndexInfosLen,
    char **pErrMsg)
{
  // query the index_list pragma
  // create index info structs
  // query the index_info pragma for cols
  int rc = SQLITE_OK;
  int numIndices = 0;
  char *zSql = 0;
  sqlite3_stmt *pStmt = 0;
  crsql_IndexInfo *indexInfos = 0;
  int i = 0;

  zSql = sqlite3_mprintf("select count(*) from pragma_index_list('%s')", tblName);
  numIndices = crsql_getCount(db, zSql);
  sqlite3_free(zSql);

  if (numIndices == 0)
  {
    *pIndexInfos = 0;
    *pIndexInfosLen = 0;
    return SQLITE_OK;
  }

  zSql = sqlite3_mprintf(
      "SELECT \"seq\", \"name\", \"unique\", \"origin\", \"partial\" FROM pragma_index_list('%s')",
      tblName);
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    *pErrMsg = sqlite3_mprintf("Failed to select from pragma_index_list");
    sqlite3_finalize(pStmt);
    return rc;
  }

  rc = sqlite3_step(pStmt);
  if (rc != SQLITE_ROW)
  {
    sqlite3_finalize(pStmt);
    return SQLITE_OK;
  }

  indexInfos = sqlite3_malloc(numIndices * sizeof *indexInfos);
  while (rc == SQLITE_ROW)
  {
    assert(i < numIndices);
    indexInfos[i].seq = sqlite3_column_int(pStmt, 0);
    indexInfos[i].name = strdup((const char *)sqlite3_column_text(pStmt, 1));
    indexInfos[i].unique = sqlite3_column_int(pStmt, 2);
    indexInfos[i].origin = strdup((const char *)sqlite3_column_text(pStmt, 3));
    indexInfos[i].partial = sqlite3_column_int(pStmt, 4);

    ++i;
    rc = sqlite3_step(pStmt);
  }
  sqlite3_finalize(pStmt);

  if (rc != SQLITE_DONE)
  {
    *pErrMsg = sqlite3_mprintf("Failed fetching an index list row");
    goto FAIL;
  }

  for (i = 0; i < numIndices; ++i)
  {
    rc = crsql_getIndexedCols(
        db,
        indexInfos[i].name,
        &(indexInfos[i].indexedCols),
        &(indexInfos[i].indexedColsLen),
        pErrMsg);

    if (rc != SQLITE_OK)
    {
      goto FAIL;
    }
  }

  *pIndexInfos = indexInfos;
  *pIndexInfosLen = numIndices;
  return rc;

FAIL:
  *pIndexInfos = 0;
  *pIndexInfosLen = 0;
  for (i = 0; i < numIndices; ++i)
  {
    crsql_freeIndexInfoContents(&indexInfos[i]);
  }
  return rc;
}

/**
 * Given a table name, return the table info that describes that table.
 * TableInfo is a struct that represents the results
 * of pragma_table_info, pragma_index_list, pragma_index_info on a given table
 * and its inidces as well as some extra fields to facilitate crr creation.
 */
int crsql_getTableInfo(
    sqlite3 *db,
    const char *tblName,
    crsql_TableInfo **pTableInfo,
    char **pErrMsg)
{
  char *zSql = 0;
  int rc = SQLITE_OK;
  sqlite3_stmt *pStmt = 0;
  int numColInfos = 0;
  int i = 0;
  crsql_ColumnInfo *columnInfos = 0;

  zSql = sqlite3_mprintf("select count(*) from pragma_table_info('%s')", tblName);
  numColInfos = crsql_getCount(db, zSql);
  sqlite3_free(zSql);

  if (numColInfos < 0)
  {
    *pErrMsg = sqlite3_mprintf("Failed to find columns for crr -- %s", tblName);
    return numColInfos;
  }

  zSql = sqlite3_mprintf("select \"cid\", \"name\", \"type\", \"notnull\", \"pk\" from pragma_table_info('%s') order by cid asc",
                         tblName);
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    *pErrMsg = sqlite3_mprintf("Failed to prepare select for crr -- %s", tblName);
    sqlite3_finalize(pStmt);
    return rc;
  }

  rc = sqlite3_step(pStmt);
  if (rc != SQLITE_ROW)
  {
    *pErrMsg = sqlite3_mprintf("Failed to parse crr definition -- %s", tblName);
    sqlite3_finalize(pStmt);
    return rc;
  }
  columnInfos = sqlite3_malloc(numColInfos * sizeof *columnInfos);
  while (rc == SQLITE_ROW)
  {
    if (i >= numColInfos) {
      sqlite3_finalize(pStmt);
      for (int j = 0; j < i; ++j) {
        crsql_freeColumnInfoContents(&columnInfos[j]);
      }
      sqlite3_free(columnInfos);
      return SQLITE_ERROR;
    }

    columnInfos[i].cid = sqlite3_column_int(pStmt, 0);

    columnInfos[i].name = strdup((const char *)sqlite3_column_text(pStmt, 1));
    columnInfos[i].type = strdup((const char *)sqlite3_column_text(pStmt, 2));

    columnInfos[i].notnull = sqlite3_column_int(pStmt, 3);
    columnInfos[i].pk = sqlite3_column_int(pStmt, 4);

    columnInfos[i].versionOf = 0;

    ++i;
    rc = sqlite3_step(pStmt);
  }
  sqlite3_finalize(pStmt);

  if (i < numColInfos) {
    for (int j = 0; j < i; ++j) {
      crsql_freeColumnInfoContents(&columnInfos[j]);
    }
    sqlite3_free(columnInfos);
    *pErrMsg = sqlite3_mprintf("Number of fetched columns did not match expected number of columns");
    return SQLITE_ERROR;
  }

  crsql_IndexInfo *indexInfos = 0;
  int numIndexInfos = 0;

  // TODO: validate indices are compatible with CRR properties
  rc = crsql_getIndexList(
      db,
      tblName,
      &indexInfos,
      &numIndexInfos,
      pErrMsg);

  if (rc != SQLITE_OK)
  {
    for (int j = 0; j < i; ++j) {
      crsql_freeColumnInfoContents(&columnInfos[j]);
    }
    sqlite3_free(columnInfos);
    return rc;
  }

  *pTableInfo = crsql_tableInfo(tblName, columnInfos, numColInfos, indexInfos, numIndexInfos);

  return SQLITE_OK;
}

void crsql_freeTableInfo(crsql_TableInfo *tableInfo)
{
  if (tableInfo == 0)
  {
    return;
  }
  // baseCols is a superset of all other col arrays
  // and will free their contents.
  crsql_freeColumnInfos(tableInfo->baseCols, tableInfo->baseColsLen);

  // the arrays themselves of course still need freeing
  sqlite3_free(tableInfo->tblName);
  sqlite3_free(tableInfo->pks);
  sqlite3_free(tableInfo->nonPks);

  crsql_freeIndexInfos(tableInfo->indexInfo, tableInfo->indexInfoLen);
  sqlite3_free(tableInfo);
}

void crsql_freeAllTableInfos(crsql_TableInfo **tableInfos, int len)
{
  for (int i = 0; i < len; ++i)
  {
    crsql_freeTableInfo(tableInfos[i]);
  }
  sqlite3_free(tableInfos);
}

crsql_TableInfo *crsql_findTableInfo(crsql_TableInfo **tblInfos, int len, const char * tblName) {
  for (int i = 0; i < len; ++i) {
    if (strcmp(tblInfos[i]->tblName, tblName) == 0) {
      return tblInfos[i];
    }
  }

  return 0;
}

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
  rc = crsql_get_table(
      db,
      CLOCK_TABLES_SELECT,
      &zzClockTableNames,
      &rNumRows,
      &rNumCols,
      0);

  if (rc != SQLITE_OK)
  {
    *errmsg = sqlite3_mprintf("crsql internal error discovering crr tables.");
    crsql_free_table(zzClockTableNames);
    return SQLITE_ERROR;
  }

  if (rNumRows == 0) {
    crsql_free_table(zzClockTableNames);
    return SQLITE_OK;
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
      crsql_free_table(zzClockTableNames);
      crsql_freeAllTableInfos(tableInfos, rNumRows);
      return rc;
    }
  }

  crsql_free_table(zzClockTableNames);

  *pzpTableInfos = tableInfos;
  *rTableInfosLen = rNumRows;

  return SQLITE_OK;
}