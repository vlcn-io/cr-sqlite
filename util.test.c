#include "cfsqlite.h"

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

// TODO: use a real unit test framework
// TODO: updated to use property based testing: https://github.com/silentbicycle/theft
void testExtractWord()
{
  char *word;

  printf("ExtractWord\n");
  word = cfsql_extractWord(0, "hello there");
  assert(strcmp(word, "hello") == 0);
  sqlite3_free(word);

  word = cfsql_extractWord(6, "hello there");
  assert(strcmp(word, "there") == 0);
  sqlite3_free(word);

  word = cfsql_extractWord(CREATE_TEMP_TABLE_CFSQL_LEN, "CREATE TEMP TABLE cfsql_tmp__foo ");
  assert(strcmp(word, "foo") == 0);
  sqlite3_free(word);

  word = cfsql_extractWord(CREATE_TEMP_TABLE_CFSQL_LEN, "CREATE TEMP TABLE cfsql_tmp__foo");
  assert(strcmp(word, "foo") == 0);
  sqlite3_free(word);
  printf("\t\e[0;32mSuccess\e[0m\n");

  word = cfsql_extractWord(DROP_TABLE_LEN + 1, "DROP TABLE foo");
  assert(strcmp(word, "foo") == 0);
  sqlite3_free(word);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testExtractIdentifier() {
  char *past = 0;
  printf("ExtractIdentifier\n");

  assert(strcmp(cfsql_extractIdentifier("[foo].[bar]", &past), "foo") == 0);
  assert(strcmp(cfsql_extractIdentifier("foo.bar", &past), "foo") == 0);
  assert(strcmp(cfsql_extractIdentifier("[foo](", &past), "foo") == 0);
  assert(strcmp(cfsql_extractIdentifier("[foo] ", &past), "foo") == 0);
  assert(strcmp(cfsql_extractIdentifier("foo ", &past), "foo") == 0);
  assert(strcmp(cfsql_extractIdentifier("foo (", &past), "foo") == 0);
  assert(strcmp(cfsql_extractIdentifier("foo( ", &past), "foo") == 0);
  assert(strcmp(cfsql_extractIdentifier("\"foo\".bar", &past), "foo") == 0);
  assert(strcmp(cfsql_extractIdentifier("`foo`.bar", &past), "foo") == 0);
  assert(strcmp(cfsql_extractIdentifier("```foo```.bar", &past), "``foo``") == 0);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testGetVersionUnionQuery()
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

  query = cfsql_getDbVersionUnionQuery(
      numRows_tc1,
      tableNames_tc1);
  assert(strcmp(query, "SELECT max(version) FROM (SELECT max(version) FROM \"foo\" WHERE site_id = ?  )") == 0);
  sqlite3_free(query);

  query = cfsql_getDbVersionUnionQuery(
      numRows_tc2,
      tableNames_tc2);
  assert(strcmp(query, "SELECT max(version) FROM (SELECT max(version) FROM \"foo\" WHERE site_id = ? UNION SELECT max(version) FROM \"bar\" WHERE site_id = ? UNION SELECT max(version) FROM \"baz\" WHERE site_id = ?  )") == 0);
  sqlite3_free(query);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testDoesTableExist()
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

  assert(cfsql_doesTableExist(db, "foo") == 0);
  sqlite3_exec(db, "CREATE TABLE foo (a, b)", 0, 0, 0);
  assert(cfsql_doesTableExist(db, "foo") == 1);

  sqlite3_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testGetCount()
{
  sqlite3 *db = 0;
  int rc = SQLITE_OK;
  printf("GetCount\n");

  rc = sqlite3_open(":memory:", &db);
  sqlite3_exec(db, "CREATE TABLE foo (a); INSERT INTO foo VALUES (1);", 0, 0, 0);
  rc = cfsql_getCount(db, "SELECT count(*) FROM foo");

  assert(rc == 1);
  sqlite3_exec(db, "INSERT INTO foo VALUES (1);", 0, 0, 0);
  rc = cfsql_getCount(db, "SELECT count(*) FROM foo");
  assert(rc == 2);

  sqlite3_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testJoinWith()
{
  printf("JoinWith\n");
  char dest[13];
  char *src[] = {
      "one",
      "two",
      "four"};

  cfsql_joinWith(dest, src, 3, ',');

  assert(strcmp(dest, "one,two,four") == 0);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testGetIndexedCols()
{
  printf("GetIndexedCols\n");

  sqlite3 *db = 0;
  int rc = SQLITE_OK;
  char **indexedCols = 0;
  int indexedColsLen;

  rc = sqlite3_open(":memory:", &db);
  sqlite3_exec(db, "CREATE TABLE foo (a);", 0, 0, 0);
  sqlite3_exec(db, "CREATE TABLE bar (a primary key);", 0, 0, 0);

  rc = cfsql_getIndexedCols(
      db,
      "sqlite_autoindex_foo_1",
      &indexedCols,
      &indexedColsLen);
  CHECK_OK

  assert(indexedColsLen == 0);
  assert(indexedCols == 0);

  rc = cfsql_getIndexedCols(
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

void testAsIdentifierListStr() {
  printf("AsIdentifierListStr\n");
  
  char* tc1[] = {
    "one",
    "two",
    "three"
  };
  char *res;

  res = cfsql_asIdentifierListStr(
    tc1,
    3,
    ','
  );

  assert(strcmp(res, "\"one\",\"two\",\"three\"") == 0);
  assert(strlen(res) == 19);
  sqlite3_free(res);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

char* join2map(const char *in) {
  return sqlite3_mprintf("foo %s bar", in);
}

void testJoin2() {
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

  result = cfsql_join2(&join2map, tc0, 0, ", ");
  assert(result == 0);

  result = cfsql_join2(&join2map, tc1, 1, ", ");
  assert(strcmp(result, "foo one bar") == 0);
  sqlite3_free(result);

  result = cfsql_join2(&join2map, tc2, 2, ", ");
  assert(strcmp(result, "foo one bar, foo two bar") == 0);
  sqlite3_free(result);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void cfsqlUtilTestSuite()
{
  printf("\e[47m\e[1;30mSuite: cfsql_util\e[0m\n");

  testExtractWord();
  testGetVersionUnionQuery();
  testDoesTableExist();
  testGetCount();
  testJoinWith();
  testGetIndexedCols();
  testAsIdentifierListStr();
  testJoin2();
  testExtractIdentifier();

  // TODO: test pk pulling and correct sorting of pks
  // TODO: create a fn to create test tables for all tests.
}