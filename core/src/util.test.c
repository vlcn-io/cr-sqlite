#include "util.h"

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "consts.h"
#include "crsqlite.h"

#ifndef CHECK_OK
#define CHECK_OK         \
  if (rc != SQLITE_OK) { \
    goto fail;           \
  }
#endif

int crsql_close(sqlite3 *db);

static void testGetVersionUnionQuery() {
  int numRows_tc1 = 1;
  char *tableNames_tc1[] = {
      "tbl_name",
      "foo",
  };
  int numRows_tc2 = 3;
  char *tableNames_tc2[] = {"tbl_name", "foo", "bar", "baz"};
  char *query;
  printf("GetVersionUnionQuery\n");

  query = crsql_getDbVersionUnionQuery(numRows_tc1, tableNames_tc1);
  printf("query: %s", query);
  assert(
      strcmp(
          query,
          "SELECT max(version) as version FROM (SELECT max(__crsql_db_version) "
          "as version FROM \"foo\"   UNION SELECT value as version FROM "
          "crsql_master WHERE key = 'pre_compact_dbversion')") == 0);
  sqlite3_free(query);

  query = crsql_getDbVersionUnionQuery(numRows_tc2, tableNames_tc2);
  assert(
      strcmp(
          query,
          "SELECT max(version) as version FROM (SELECT max(__crsql_db_version) "
          "as version FROM \"foo\" UNION ALL SELECT max(__crsql_db_version) as "
          "version FROM \"bar\" UNION ALL SELECT max(__crsql_db_version) as "
          "version FROM \"baz\"   UNION SELECT value as version FROM "
          "crsql_master WHERE key = 'pre_compact_dbversion')") == 0);
  sqlite3_free(query);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

static char *join2map(const char *in) {
  return sqlite3_mprintf("foo %s bar", in);
}

void crsqlUtilTestSuite() {
  printf("\e[47m\e[1;30mSuite: crsql_util\e[0m\n");

  testGetVersionUnionQuery();

  // TODO: test pk pulling and correct sorting of pks
  // TODO: create a fn to create test tables for all tests.
}