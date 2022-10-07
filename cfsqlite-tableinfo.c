#include "cfsqlite-tableinfo.h"
#include "cfsqlite.h"
#include "cfsqlite-util.h"
#include "cfsqlite-consts.h"

#include <ctype.h>
#include <string.h>
#include <stdlib.h>
#include <assert.h>
#include <stdio.h>

// TODO: generalize to `asList` for identifiers or values or bind vars
char *cfsql_asIdentifierList(cfsql_ColumnInfo *in, size_t inlen)
{
  if (inlen <= 0)
  {
    return 0;
  }

  char **mapped = sqlite3_malloc(inlen * sizeof(char *));
  int finalLen = 0;
  char *ret = 0;

  for (int i = 0; i < inlen; ++i)
  {
    mapped[i] = sqlite3_mprintf("\"%w\"", in[i].name);
    finalLen += strlen(mapped[i]);
  }
  // -1 for spearator not appended to last thing
  finalLen += inlen - 1;

  // + 1 for null terminator
  ret = sqlite3_malloc(finalLen * sizeof(char) + 1);
  ret[finalLen] = '\0';

  cfsql_joinWith(ret, mapped, inlen, ',');

  // free everything we allocated, except ret.
  // caller will free ret.
  for (int i = 0; i < inlen; ++i)
  {
    sqlite3_free(mapped[i]);
  }
  sqlite3_free(mapped);

  return ret;
}

char *cfsql_asColumnDefinitions(cfsql_ColumnInfo *in, size_t inlen)
{
  char *ret = 0;
  int finalLen = 0;
  char **mapped = sqlite3_malloc(inlen * sizeof(char *));

  for (int i = 0; i < inlen; ++i)
  {
    mapped[i] = sqlite3_mprintf("\"%w\" %s %s",
                                in[i].name,
                                in[i].type,
                                in[i].dfltValue != 0 ? "DEFAULT ?" : 0);
    finalLen += strlen(mapped[i]);
  }
  finalLen += inlen - 1;

  ret = sqlite3_malloc(finalLen * sizeof(char) + 1);
  ret[finalLen] = '\0';

  cfsql_joinWith(ret, mapped, inlen, ',');

  // free everything we allocated, except ret.
  // caller will free ret.
  for (int i = 0; i < inlen; ++i)
  {
    sqlite3_free(mapped[i]);
  }
  sqlite3_free(mapped);

  return ret;
}

void cfsql_freeColumnInfoContents(cfsql_ColumnInfo *columnInfo)
{
  sqlite3_free(columnInfo->name);
  sqlite3_value_free(columnInfo->dfltValue);
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

void cfsql_freeIndexInfoContents(cfsql_IndexInfo *indexInfo)
{
  sqlite3_free(indexInfo->name);
  sqlite3_free(indexInfo->origin);
  for (int j = 0; j < indexInfo->indexedColsLen; ++j)
  {
    sqlite3_free(indexInfo->indexedCols[j]);
  }
  sqlite3_free(indexInfo->indexedCols);
}


void cfsql_freeIndexInfos(cfsql_IndexInfo *indexInfos, int indexInfosLen) {
  for (int i = 0; i < indexInfosLen; ++i) {
    cfsql_freeIndexInfoContents(&indexInfos[i]);
  }

  sqlite3_free(indexInfos);
}

static void cfsql_freeColumnInfos(cfsql_ColumnInfo *columnInfos, int len)
{
  int i = 0;
  for (i = 0; i < len; ++i)
  {
    cfsql_freeColumnInfoContents(&columnInfos[i]);
  }

  sqlite3_free(columnInfos);
}

cfsql_ColumnInfo *cfsql_extractBaseCols(
    cfsql_ColumnInfo *colInfos,
    int colInfosLen,
    int *pBaseColsLen)
{
  int i = 0;
  int j = 0;
  int numBaseCols = 0;
  cfsql_ColumnInfo *ret = 0;

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

int cfsql_numPks(
    cfsql_ColumnInfo *colInfos,
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

/**
 * Returns a copy of colInfos that is filled in with the version columns
 * required to support LWW.
 */
cfsql_ColumnInfo *cfsql_addVersionCols(
    cfsql_ColumnInfo *colInfos,
    int colInfosLen,
    int *pCrrColsLen)
{
  // Primary key columns do not participate in versioning
  // * 2 since we add a col for every non pk col
  // + numPks since they are still part of the final table
  int numPks = cfsql_numPks(colInfos, colInfosLen);
  int totalCols = (colInfosLen - numPks) * 2 + numPks;
  cfsql_ColumnInfo *ret = sqlite3_malloc(totalCols * sizeof *ret);
  *pCrrColsLen = totalCols;
  int i = 0;
  int j = 0;

  for (i = 0; i < colInfosLen; ++i)
  {
    ret[j] = colInfos[i];
    ++j;
    if (colInfos[i].pk == 0)
    {
      // add a version col
      assert(j < totalCols);

      ret[j].cid = -1;
      ret[j].name = sqlite3_mprintf(
          "%s__cfsql_v",
          colInfos[i].name);
      ret[j].notnull = 0;
      ret[j].pk = 0;
      ret[j].type = "INTEGER";
      ret[j].versionOf = colInfos[i].name;
      ret[j].dfltValue = 0;
      ++j;
    }
  }

  assert(j == totalCols);
  return ret;
}

static int cmpPks(const void *a, const void *b)
{
  return (((cfsql_ColumnInfo *)a)->pk - ((cfsql_ColumnInfo *)b)->pk);
}

cfsql_ColumnInfo *cfsql_pks(cfsql_ColumnInfo *colInfos,
                            int colInfosLen,
                            int *pPksLen)
{
  int numPks = cfsql_numPks(colInfos, colInfosLen);
  cfsql_ColumnInfo *ret = 0;
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

  qsort(ret, numPks, sizeof(cfsql_ColumnInfo), cmpPks);

  assert(j == numPks);
  return ret;
}

cfsql_ColumnInfo *cfsql_nonPks(cfsql_ColumnInfo *colInfos,
                               int colInfosLen,
                               int *pNonPksLen)
{
  int nonPksLen = colInfosLen - cfsql_numPks(colInfos, colInfosLen);
  cfsql_ColumnInfo *ret = 0;
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
static cfsql_TableInfo *cfsql_tableInfo(
    int tblType,
    const char *tblName,
    cfsql_ColumnInfo *colInfos,
    int colInfosLen,
    cfsql_IndexInfo *indexInfos,
    int indexInfosLen)
{
  cfsql_TableInfo *ret = sqlite3_malloc(sizeof *ret);
  int tmpLen = 0;

  if (tblType == CRR_SPACE)
  {
    ret->withVersionCols = colInfos;
    ret->withVersionColsLen = colInfosLen;
    ret->baseCols = cfsql_extractBaseCols(colInfos, colInfosLen, &(ret->baseColsLen));
  }
  else if (tblType == USER_SPACE)
  {
    ret->baseCols = colInfos;
    ret->baseColsLen = colInfosLen;
    ret->withVersionCols = cfsql_addVersionCols(colInfos, colInfosLen, &(ret->withVersionColsLen));
  }
  else
  {
    // should be impossible to get here
    sqlite3_free(ret);
    cfsql_freeColumnInfos(colInfos, colInfosLen);
    return 0;
  }

  ret->tblName = strdup(tblName);

  ret->nonPks = cfsql_nonPks(ret->baseCols, ret->baseColsLen, &(ret->nonPksLen));
  ret->pks = cfsql_pks(ret->baseCols, ret->baseColsLen, &(ret->pksLen));
  ret->indexInfo = indexInfos;
  ret->indexInfoLen = indexInfosLen;

  return ret;
}

/**
 * Given a table, return (into pIndexInfo) all the
 * indices for that table and the columns indexed.
 */
int cfsql_getIndexList(
    sqlite3 *db,
    const char *tblName,
    cfsql_IndexInfo **pIndexInfos,
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
  cfsql_IndexInfo *indexInfos = 0;
  int i = 0;

  zSql = sqlite3_mprintf("select count(*) from pragma_index_list('%s')", tblName);
  numIndices = cfsql_getCount(db, zSql);
  sqlite3_free(zSql);

  if (numIndices == 0) {
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
    sqlite3_finalize(pStmt);
    return rc;
  }

  rc = sqlite3_step(pStmt);
  if (rc != SQLITE_ROW)
  {
    sqlite3_finalize(pStmt);
    return rc;
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
    goto FAIL;
  }

  for (i = 0; i < numIndices; ++i)
  {
    rc = cfsql_getIndexedCols(
        db,
        indexInfos[i].name,
        &(indexInfos[i].indexedCols),
        &(indexInfos[i].indexedColsLen));

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
    cfsql_freeIndexInfoContents(&indexInfos[i]);
  }
  return rc;
}

/**
 * Given a table name, return the table info that describes that table.
 * TableInfo is a struct that represents the results
 * of pragma_table_info, pragma_index_list, pragma_index_info on a given table
 * and its inidces as well as some extra fields to facilitate crr creation.
 */
int cfsql_getTableInfo(
    sqlite3 *db,
    int tblType,
    const char *tblName,
    cfsql_TableInfo **pTableInfo,
    char **pErrMsg)
{
  char *zSql = 0;
  int rc = SQLITE_OK;
  sqlite3_stmt *pStmt = 0;
  int numColInfos = 0;
  int i = 0;
  cfsql_ColumnInfo *columnInfos = 0;
  const char *tmp = 0;
  char *tmp2 = 0;
  int tmpLen = 0;

  zSql = sqlite3_mprintf("select count(*) from pragma_table_info(\"%s\")", tblName);
  numColInfos = cfsql_getCount(db, zSql);
  sqlite3_free(zSql);

  if (numColInfos < 0)
  {
    return numColInfos;
  }

  zSql = sqlite3_mprintf("select \"cid\", \"name\", \"type\", \"notnull\", \"pk\", \"dflt_value\" from pragma_table_info(\"%s\")",
                         tblName);
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    sqlite3_finalize(pStmt);
    return rc;
  }

  rc = sqlite3_step(pStmt);
  if (rc != SQLITE_ROW)
  {
    sqlite3_finalize(pStmt);
    return rc;
  }
  columnInfos = sqlite3_malloc(numColInfos * sizeof *columnInfos);
  while (rc == SQLITE_ROW)
  {
    assert(i < numColInfos);

    columnInfos[i].cid = sqlite3_column_int(pStmt, 0);

    columnInfos[i].name = strdup((const char *)sqlite3_column_text(pStmt, 1));
    columnInfos[i].type = strdup((const char *)sqlite3_column_text(pStmt, 2));

    columnInfos[i].notnull = sqlite3_column_int(pStmt, 3);
    columnInfos[i].pk = sqlite3_column_int(pStmt, 4);
    columnInfos[i].dfltValue = sqlite3_value_dup(sqlite3_column_value(pStmt, 5));
    columnInfos[i].versionOf = 0;

    ++i;
    rc = sqlite3_step(pStmt);
  }
  sqlite3_finalize(pStmt);

  cfsql_IndexInfo *indexInfos;
  int numIndexInfos;

  rc = cfsql_getIndexList(
      db,
      tblName,
      &indexInfos,
      &numIndexInfos,
      pErrMsg);

  if (rc != SQLITE_OK)
  {
    return rc;
  }

  *pTableInfo = cfsql_tableInfo(tblType, tblName, columnInfos, numColInfos, indexInfos, numIndexInfos);

  return SQLITE_OK;
}

void cfsql_freeTableInfo(cfsql_TableInfo *tableInfo)
{
  // withVersionCols is a superset of all other col arrays
  // and will free their contents.
  cfsql_freeColumnInfos(tableInfo->withVersionCols, tableInfo->withVersionColsLen);

  // the arrays themselves of course still need freeing
  sqlite3_free(tableInfo->tblName);
  sqlite3_free(tableInfo->baseCols);
  sqlite3_free(tableInfo->pks);
  sqlite3_free(tableInfo->nonPks);

  cfsql_freeIndexInfos(tableInfo->indexInfo, tableInfo->indexInfoLen);
  sqlite3_free(tableInfo);
}
