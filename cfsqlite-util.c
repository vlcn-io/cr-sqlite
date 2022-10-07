#include "cfsqlite.h"
#include "cfsqlite-util.h"
#include "cfsqlite-consts.h"

#include <ctype.h>
#include <string.h>
#include <stdlib.h>
#include <assert.h>
#include <stdio.h>

static char *joinHelper(char **in, size_t inlen, size_t inpos, size_t accum)
{
  if (inpos == inlen)
  {
    return strcpy(sqlite3_malloc(accum + 1) + accum, "");
  }
  else
  {
    size_t mylen = strlen(in[inpos]);
    return memcpy(
        joinHelper(in, inlen, inpos + 1, accum + mylen) - mylen,
        in[inpos], mylen);
  }
}

/**
 * @brief Join an array of strings into a single string
 *
 * @param in array of strings
 * @param inlen length of the array in
 * @return char* string -- must be freed by caller
 */
char *cfsql_join(char **in, size_t inlen)
{
  return joinHelper(in, inlen, 0, 0);
}

void cfsql_joinWith(char *dest, char** src, size_t srcLen, char delim) {
  int j = 0;
  for (int i = 0; i < srcLen; ++i)
  {
    // copy mapped thing into ret at offset j.
    strcpy(dest + j, src[i]);
    // bump up j for next str.
    j += strlen(src[i]);

    // not the last element? then we need the separator
    if (i < srcLen - 1)
    {
      dest[j] = ',';
      j += 1;
    }
  }
}

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

/**
 * Reads tokens until the first space or end of string is encountered.
 * Returns the tokens read.
 *
 * If str starts with a space, returns empty string.
 */
char *cfsql_extractWord(
    int prefixLen,
    char *str)
{
  char *tblName;
  int tblNameLen = 0;
  char *splitIndex;

  splitIndex = strstr(str + prefixLen, " ");
  if (splitIndex == NULL)
  {
    splitIndex = str + strlen(str);
  }

  tblNameLen = splitIndex - (str + prefixLen);
  tblName = sqlite3_malloc(tblNameLen + 1);
  strncpy(tblName, str + prefixLen, tblNameLen);
  tblName[tblNameLen] = '\0';

  return tblName;
}

/**
 * @brief Given a list of clock table names, construct a union query to get the max clock value for our site.
 *
 * @param numRows the number of rows returned by the table names query
 * @param rQuery output param. Needs to be freed by the caller. The query being build
 * @param tableNames array of clock table names
 * @return int success or not
 */
char *cfsql_getDbVersionUnionQuery(
    int numRows,
    char **tableNames)
{
  char **unionsArr = sqlite3_malloc(sizeof(char) * numRows);
  char *unionsStr;
  char *ret;
  int i = 0;

  for (i = 0; i < numRows; ++i)
  {
    unionsArr[i] = sqlite3_mprintf(
        "SELECT max(version) FROM \"%w\" WHERE site_id = ? %s ",
        // the first result in tableNames is the column heading
        // so skip that
        tableNames[i + 1],
        // If we have more tables to process, union them in
        i < numRows - 1 ? UNION : "");
  }

  // move the array of strings into a single string
  unionsStr = cfsql_join(unionsArr, numRows);
  // free the array of strings
  for (i = 0; i < numRows; ++i)
  {
    sqlite3_free(unionsArr[i]);
  }
  sqlite3_free(unionsArr);

  // compose the final query
  // and update the pointer to the string to point to it.
  ret = sqlite3_mprintf(
      "SELECT max(version) FROM (%z)",
      unionsStr);
  // %z frees unionsStr https://www.sqlite.org/printf.html#percentz
  return ret;
}

/**
 * Check if tblName exists.
 * Caller is responsible for freeing tblName.
 *
 * Returns -1 on error.
 */
int cfsql_doesTableExist(sqlite3 *db, const char *tblName)
{
  char *zSql;
  sqlite3_stmt *pStmt = 0;
  int rc = SQLITE_OK;
  int ret = 0;

  zSql = sqlite3_mprintf(
      "SELECT count(*) as c FROM sqlite_master WHERE type='table' AND tbl_name = \"%s\"",
      tblName);
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    return -1;
  }

  rc = sqlite3_step(pStmt);

  // a row must be returned. If no results we get a single row of count 0.
  if (rc != SQLITE_ROW)
  {
    sqlite3_finalize(pStmt);
    return -1;
  }

  ret = sqlite3_column_int(pStmt, 0);
  sqlite3_finalize(pStmt);

  return ret;
}

int cfsql_getCount(
    sqlite3 *db,
    char *zSql)
{
  int rc = SQLITE_OK;
  int count = 0;
  sqlite3_stmt *pStmt = 0;

  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  if (rc != SQLITE_OK)
  {
    sqlite3_finalize(pStmt);
    return -1 * rc;
  }

  rc = sqlite3_step(pStmt);
  if (rc != SQLITE_ROW)
  {
    sqlite3_finalize(pStmt);
    return -1 * rc;
  }

  count = sqlite3_column_int(pStmt, 0);
  sqlite3_finalize(pStmt);

  return count;
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

static int cmpPks(const void * a, const void * b) {
   return ( ((cfsql_ColumnInfo*)a)->pk - ((cfsql_ColumnInfo*)b)->pk );
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
    int colInfosLen)
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

  return ret;
}

/**
 * Given a table, return (into pIndexInfo) all the
 * indices for that table and the columns indexed.
 */
int cfsql_getIndexList(
  sqlite3 *db,
  const char *tblName,
  cfsql_IndexInfo **pIndexInfo,
  char **pErrMsg
) {
  // query the index_list pragma
  // create index info structs
  // query the index_info pragma for cols
  int rc = SQLITE_OK;
  char *zSql = 0;
  // zSql = sqlite3_mprintf("SELECT seq, name, unique, origin, partial FROM pragam_index_list(%s)");

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
  int numRows = 0;
  int i = 0;
  cfsql_ColumnInfo *columnInfos = 0;
  const char *tmp = 0;
  char *tmp2 = 0;
  int tmpLen = 0;

  zSql = sqlite3_mprintf("select count(*) from pragma_table_info(\"%s\")", tblName);
  numRows = cfsql_getCount(db, zSql);
  sqlite3_free(zSql);

  if (numRows < 0)
  {
    return numRows;
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

  columnInfos = sqlite3_malloc(numRows * sizeof *columnInfos);
  rc = sqlite3_step(pStmt);
  while (rc == SQLITE_ROW)
  {
    assert(i < numRows);

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

  *pTableInfo = cfsql_tableInfo(tblType, tblName, columnInfos, numRows);
  sqlite3_finalize(pStmt);
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
}
