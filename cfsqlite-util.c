#include "cfsqlite.h"
#include "cfsqlite-util.h"
#include "cfsqlite-consts.h"

#include <ctype.h>
#include <string.h>
#include <stdlib.h>
#include <assert.h>

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

// DO NOT dupe the memory!
const char *cfsql_identity(const char *x) {
  return x;
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

void cfsql_joinWith(char *dest, char **src, size_t srcLen, char delim)
{
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
      dest[j] = delim;
      j += 1;
    }
  }
}

// TODO: re-write all users of other join methods to just
// use this
char *cfsql_join2(char *(*map)(const char *), char **in, size_t len, char* delim) {
  if (len == 0) {
    return 0;
  }

  char *toJoin[len];
  int resultLen = 0;
  char *ret = 0;
  for (int i = 0; i < len; ++i) {
    toJoin[i] = map(in[i]);
    resultLen += strlen(toJoin[i]);
  }
  resultLen += (len - 1) * strlen(delim);
  ret = sqlite3_malloc(resultLen * sizeof(char) + 1);
  ret[resultLen] = '\0';

  int j = 0;
  for (int i = 0; i < len; ++i)
  {
    // copy mapped thing into ret at offset j.
    strcpy(ret + j, toJoin[i]);
    // bump up j for next str.
    j += strlen(toJoin[i]);

    // not the last element? then we need the separator
    if (i < len - 1)
    {
      strcpy(ret + j, delim);
      j += strlen(delim);
    }

    sqlite3_free(toJoin[i]);
  }

  return ret;
}

// TODO:
// have this take a function pointer that extracts the string so we can
// delete cfsql_asIdentifierList
char *cfsql_asIdentifierListStr(char **in, size_t inlen, char delim)
{
  int finalLen = 0;
  char *ret = 0;
  char *mapped[inlen];

  for (int i = 0; i < inlen; ++i)
  {
    mapped[i] = sqlite3_mprintf("\"%w\"", in[i]);
    finalLen += strlen(mapped[i]);
  }
  // -1 for spearator not appended to last thing
  finalLen += inlen - 1;

  // + 1 for null terminator
  ret = sqlite3_malloc(finalLen * sizeof(char) + 1);
  ret[finalLen] = '\0';

  cfsql_joinWith(ret, mapped, inlen, delim);

  // free everything we allocated, except ret.
  // caller will free ret.
  for (int i = 0; i < inlen; ++i)
  {
    sqlite3_free(mapped[i]);
  }

  return ret;
}

/**
 * Reads tokens until the first space, end of string or '(' is encountered.
 * Returns the tokens read.
 *
 * If str starts with a space, returns empty string.
 * 
 * TODO: handle quoted identifiers...
 * The person being returned to will add their own quotes and also needs to
 * know the total length of the quoted thing including quotes :/
 */
char *cfsql_extractWord(
    int prefixLen,
    const char *str)
{
  char *tblName;
  int tblNameLen = 0;
  const char *splitIndex;
  const char *splitIndexParen;

  splitIndex = strstr(str + prefixLen, " ");
  splitIndexParen = strstr(str + prefixLen, "(");
  if (splitIndex == NULL)
  {
    splitIndex = str + strlen(str);
  }
  if (splitIndexParen != NULL && splitIndexParen < splitIndex) {
    splitIndex = splitIndexParen;
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
  char *unionsArr[numRows];
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
  ret = cfsql_getCount(db, zSql);
  sqlite3_free(zSql);

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

/**
 * Given an index name, return all the columns in that index.
 * Fills pIndexedCols with an array of strings.
 * Caller is responsible for freeing pIndexedCols.
 */
int cfsql_getIndexedCols(
    sqlite3 *db,
    const char *indexName,
    char ***pIndexedCols,
    int *pIndexedColsLen)
{
  int rc = SQLITE_OK;
  int numCols = 0;
  char **indexedCols;
  sqlite3_stmt *pStmt = 0;
  *pIndexedCols = 0;
  *pIndexedColsLen = 0;

  char *zSql = sqlite3_mprintf(
      "SELECT count(*) FROM temp.pragma_index_info('%s')",
      indexName);
  numCols = cfsql_getCount(db, zSql);
  sqlite3_free(zSql);

  if (numCols <= 0)
  {
    return numCols;
  }

  zSql = sqlite3_mprintf("SELECT \"name\" FROM temp.pragma_index_info('%s') ORDER BY \"seq\" ASC");
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

  int j = 0;
  indexedCols = sqlite3_malloc(numCols * sizeof(char *));
  while (rc == SQLITE_ROW)
  {
    assert(j < numCols);

    indexedCols[j] = strdup((const char *)sqlite3_column_text(pStmt, 0));

    rc = sqlite3_step(pStmt);
    ++j;
  }
  sqlite3_finalize(pStmt);

  if (rc != SQLITE_DONE)
  {
    for (int i = 0; i < j; ++i)
    {
      sqlite3_free(indexedCols[i]);
    }
    sqlite3_free(indexedCols);
    return rc;
  }

  *pIndexedCols = indexedCols;
  *pIndexedColsLen = numCols;

  return SQLITE_OK;
}
