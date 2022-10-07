#include "cfsqlite.h"

#include "cfsqlite-util.h"
#include "cfsqlite-consts.h"
#include "cfsqlite-tableinfo.h"
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

void testCreateClockTable()
{
  printf("CreateClockTable\n");

  sqlite3 *db;
  int rc;
  cfsql_TableInfo *tc1;
  cfsql_TableInfo *tc2;
  cfsql_TableInfo *tc3;
  cfsql_TableInfo *tc4;
  char *err = 0;

  rc = sqlite3_open(":memory:", &db);
  sqlite3_exec(db, "CREATE TABLE foo (a)", 0, 0, 0);
  sqlite3_exec(db, "CREATE TABLE bar (a primary key)", 0, 0, 0);
  sqlite3_exec(db, "CREATE TABLE baz (a primary key, b)", 0, 0, 0);
  sqlite3_exec(db, "CREATE TABLE boo (a primary key, b, c)", 0, 0, 0);

  rc = cfsql_getTableInfo(db, USER_SPACE, "foo", &tc1, &err);
  CHECK_OK
  rc = cfsql_getTableInfo(db, USER_SPACE, "bar", &tc2, &err);
  CHECK_OK
  rc = cfsql_getTableInfo(db, USER_SPACE, "baz", &tc3, &err);
  CHECK_OK
  rc = cfsql_getTableInfo(db, USER_SPACE, "boo", &tc4, &err);
  CHECK_OK

  rc = cfsql_createClockTable(db, tc1, &err);
  CHECK_OK
  rc = cfsql_createClockTable(db, tc2, &err);
  CHECK_OK
  rc = cfsql_createClockTable(db, tc3, &err);
  CHECK_OK
  rc = cfsql_createClockTable(db, tc4, &err);
  CHECK_OK

  // TODO: check that the tables have the expected schema

  printf("\t\e[0;32mSuccess\e[0m\n");
  return;

fail:
  printf("err: %s %d\n", err, rc);
  sqlite3_free(err);
  assert(rc == SQLITE_OK);
}

// TODO: create a method that generates all the table conditions
// we're interested in and runs these tests over them.
void testCreateCrrBaseTable()
{
  printf("CreateCrrBaseTable\n");

  int rc = SQLITE_OK;
  sqlite3* db;
  char *err = 0;
  cfsql_TableInfo * tableInfo = 0;
  rc = sqlite3_open(":memory:", &db);

  rc = sqlite3_exec(db, "CREATE TABLE foo (a primary key, b DEFAULT 0)", 0, 0, &err);
  CHECK_OK
  // using the crr interface, it'd be impossible to have a new table
  // creation that includes an index. Index additions would be
  // statements after crr creation and thus can be added simply by
  // changing the target table of the user's create index statement to the crr table.
  // rc = sqlite3_exec(db, "CREATE INDEX foo_b ON foo (b)", 0, 0, &err);
  // CHECK_OK

  rc = cfsql_getTableInfo(db, USER_SPACE, "foo", &tableInfo, &err);
  CHECK_OK
  rc = cfsql_createCrrBaseTable(db, tableInfo, &err);
  CHECK_OK

  // now select the base table sql and check it is what is expected.

  printf("\t\e[0;32mSuccess\e[0m\n");
  return;

  fail:
    printf("err: %s %d\n", err, rc);
    sqlite3_free(err);
    cfsql_freeTableInfo(tableInfo);
    assert(rc == SQLITE_OK);
}

void testCreateViewOfCrr()
{
  printf("CreateViewOfCrr\n");

  int rc = SQLITE_OK;
  sqlite3* db;
  char *err = 0;
  cfsql_TableInfo * tableInfo = 0;
  rc = sqlite3_open(":memory:", &db);

  rc = sqlite3_exec(db, "CREATE TABLE foo (a primary key, b DEFAULT 0)", 0, 0, &err);
  CHECK_OK

  rc = cfsql_getTableInfo(db, USER_SPACE, "foo", &tableInfo, &err);
  CHECK_OK
  rc = cfsql_createCrrBaseTable(db, tableInfo, &err);
  CHECK_OK

  rc = sqlite3_exec(db, "DROP TABLE foo", 0, 0, &err);
  CHECK_OK

  rc = cfsql_createViewOfCrr(db, tableInfo, &err);
  CHECK_OK

  printf("\t\e[0;32mSuccess\e[0m\n");
  return;

  fail:
    printf("err: %s %d\n", err, rc);
    sqlite3_free(err);
    cfsql_freeTableInfo(tableInfo);
    assert(rc == SQLITE_OK);
}

void cfsqlTestSuite() {
  printf("\e[47m\e[1;30mSuite: cfsql\e[0m\n");

  testCreateClockTable();
  testCreateCrrBaseTable();
  testCreateViewOfCrr();
}