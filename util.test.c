#include "crsqlite.h"

#include "util.h"
#include "consts.h"
#include "tableinfo.h"
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

#ifndef CHECK_OK
#define CHECK_OK       \
  if (rc != SQLITE_OK) \
  {                    \
    goto fail;         \
  }
#endif

static void testGetVersionUnionQuery()
{
  int numRows_tc1 = 1;
  char *tableNames_tc1[] = {
      "tbl_name",
      "foo",
  };
  int numRows_tc2 = 3;
  char *tableNames_tc2[] = {
      "tbl_name",
      "foo",
      "bar",
      "baz"};
  char *query;
  printf("GetVersionUnionQuery\n");

  query = crsql_getDbVersionUnionQuery(
      numRows_tc1,
      tableNames_tc1);
  assert(strcmp(query, "SELECT max(version) as version FROM (SELECT max(__crsql_version) as version FROM \"foo\"  )") == 0);
  sqlite3_free(query);

  query = crsql_getDbVersionUnionQuery(
      numRows_tc2,
      tableNames_tc2);
  assert(strcmp(query, "SELECT max(version) as version FROM (SELECT max(__crsql_version) as version FROM \"foo\" UNION SELECT max(__crsql_version) as version FROM \"bar\" UNION SELECT max(__crsql_version) as version FROM \"baz\"  )") == 0);
  sqlite3_free(query);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testDoesTableExist()
{
  sqlite3 *db;
  int rc;
  printf("DoesTableExist\n");

  rc = sqlite3_open(":memory:", &db);
  if (rc)
  {
    fprintf(stderr, "Can't open database: %s\n", sqlite3_errmsg(db));
    sqlite3_close(db);
    return;
  }

  assert(crsql_doesTableExist(db, "foo") == 0);
  sqlite3_exec(db, "CREATE TABLE foo (a, b)", 0, 0, 0);
  assert(crsql_doesTableExist(db, "foo") == 1);

  sqlite3_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testGetCount()
{
  sqlite3 *db = 0;
  int rc = SQLITE_OK;
  printf("GetCount\n");

  rc = sqlite3_open(":memory:", &db);
  sqlite3_exec(db, "CREATE TABLE foo (a); INSERT INTO foo VALUES (1);", 0, 0, 0);
  rc = crsql_getCount(db, "SELECT count(*) FROM foo");

  assert(rc == 1);
  sqlite3_exec(db, "INSERT INTO foo VALUES (1);", 0, 0, 0);
  rc = crsql_getCount(db, "SELECT count(*) FROM foo");
  assert(rc == 2);

  sqlite3_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testJoinWith()
{
  printf("JoinWith\n");
  char dest[13];
  char *src[] = {
      "one",
      "two",
      "four"};

  crsql_joinWith(dest, src, 3, ',');

  assert(strcmp(dest, "one,two,four") == 0);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testGetIndexedCols()
{
  printf("GetIndexedCols\n");

  sqlite3 *db = 0;
  int rc = SQLITE_OK;
  char **indexedCols = 0;
  int indexedColsLen;

  rc = sqlite3_open(":memory:", &db);
  sqlite3_exec(db, "CREATE TABLE foo (a);", 0, 0, 0);
  sqlite3_exec(db, "CREATE TABLE bar (a primary key);", 0, 0, 0);

  rc = crsql_getIndexedCols(
      db,
      "sqlite_autoindex_foo_1",
      &indexedCols,
      &indexedColsLen);
  CHECK_OK

  assert(indexedColsLen == 0);
  assert(indexedCols == 0);

  rc = crsql_getIndexedCols(
      db,
      "sqlite_autoindex_bar_1",
      &indexedCols,
      &indexedColsLen);
  CHECK_OK

  assert(indexedColsLen == 1);
  assert(strcmp(indexedCols[0], "a") == 0);

  sqlite3_free(indexedCols[0]);
  sqlite3_free(indexedCols);

  printf("\t\e[0;32mSuccess\e[0m\n");
  return;

fail:
  printf("bad return code: %d\n", rc);
}

static void testAsIdentifierListStr() {
  printf("AsIdentifierListStr\n");
  
  char* tc1[] = {
    "one",
    "two",
    "three"
  };
  char *res;

  res = crsql_asIdentifierListStr(
    tc1,
    3,
    ','
  );

  assert(strcmp(res, "\"one\",\"two\",\"three\"") == 0);
  assert(strlen(res) == 19);
  sqlite3_free(res);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

static char* join2map(const char *in) {
  return sqlite3_mprintf("foo %s bar", in);
}

static void testJoin2() {
  printf("Join2\n");
  char* tc0[] = {
  };
  char* tc1[] = {
    "one"
  };
  char* tc2[] = {
    "one",
    "two"
  };
  char * result;

  result = crsql_join2(&join2map, tc0, 0, ", ");
  assert(result == 0);

  result = crsql_join2(&join2map, tc1, 1, ", ");
  assert(strcmp(result, "foo one bar") == 0);
  sqlite3_free(result);

  result = crsql_join2(&join2map, tc2, 2, ", ");
  assert(strcmp(result, "foo one bar, foo two bar") == 0);
  sqlite3_free(result);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testSplit() {
  printf("Split\n");

  char *tc0 = "one, two, three";
  char *tc1 = "one~'~two~'~three";
  char *tc2 = "one~'~two";

  char ** result;
  result = crsql_split(tc0, ",", 3);
  assert(strcmp(result[0], "one") == 0);
  assert(strcmp(result[1], " two") == 0);
  assert(strcmp(result[2], " three") == 0);

  result = crsql_split(tc0, ", ", 3);
  assert(strcmp(result[0], "one") == 0);
  assert(strcmp(result[1], "two") == 0);
  assert(strcmp(result[2], "three") == 0);

  result = crsql_split(tc1, "~'~", 3);
  assert(strcmp(result[0], "one") == 0);
  assert(strcmp(result[1], "two") == 0);
  assert(strcmp(result[2], "three") == 0);

  result = crsql_split(tc2, "~'~", 2);
  assert(strcmp(result[0], "one") == 0);
  assert(strcmp(result[1], "two") == 0);

  result = crsql_split(tc2, "~'~", 3);
  assert(result == 0);

  result = crsql_split(tc2, "~'~", 1);
  assert(strcmp(result[0], "one") == 0);

  result = crsql_split(tc2, "!", 1);
  assert(strcmp(result[0], "one~'~two") == 0);

  result = crsql_split(tc2, "!", 2);
  assert(result == 0);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void crsqlUtilTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsql_util\e[0m\n");

  testGetVersionUnionQuery();
  testDoesTableExist();
  testGetCount();
  testJoinWith();
  testGetIndexedCols();
  testAsIdentifierListStr();
  testJoin2();
  testSplit();

  // TODO: test pk pulling and correct sorting of pks
  // TODO: create a fn to create test tables for all tests.
}