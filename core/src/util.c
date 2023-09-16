#include "util.h"

#include <assert.h>
#include <ctype.h>
#include <stdlib.h>
#include <string.h>

#include "consts.h"
#include "crsqlite.h"

static char *joinHelper(char **in, size_t inlen, size_t inpos, size_t accum) {
  if (inpos == inlen) {
    return strcpy((char *)sqlite3_malloc(accum + 1) + accum, "");
  } else {
    size_t mylen = strlen(in[inpos]);
    return memcpy(joinHelper(in, inlen, inpos + 1, accum + mylen) - mylen,
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
char *crsql_join(char **in, size_t inlen) {
  return joinHelper(in, inlen, 0, 0);
}

/**
 * @brief Given a list of clock table names, construct a union query to get the
 * max clock value for our site.
 *
 * @param numRows the number of rows returned by the table names query
 * @param rQuery output param. Needs to be freed by the caller. The query being
 * build
 * @param tableNames array of clock table names
 * @return int success or not
 */
char *crsql_getDbVersionUnionQuery(int numRows, char **tableNames) {
  char **unionsArr = sqlite3_malloc(numRows * sizeof(char *));
  char *unionsStr;
  char *ret;
  int i = 0;

  for (i = 0; i < numRows; ++i) {
    unionsArr[i] = sqlite3_mprintf(
        "SELECT max(__crsql_db_version) as version FROM \"%w\" %s ",
        // the first result in tableNames is the column heading
        // so skip that
        tableNames[i + 1],
        // If we have more tables to process, union them in
        i < numRows - 1 ? UNION_ALL : "");
  }

  // move the array of strings into a single string
  unionsStr = crsql_join(unionsArr, numRows);
  // free the array of strings
  for (i = 0; i < numRows; ++i) {
    sqlite3_free(unionsArr[i]);
  }
  sqlite3_free(unionsArr);

  // compose the final query
  // and update the pointer to the string to point to it.
  ret = sqlite3_mprintf(
      "SELECT max(version) as version FROM (%z UNION SELECT value as "
      "version "
      "FROM crsql_master WHERE key = 'pre_compact_dbversion')",
      unionsStr);
  // %z frees unionsStr https://www.sqlite.org/printf.html#percentz
  return ret;
}
