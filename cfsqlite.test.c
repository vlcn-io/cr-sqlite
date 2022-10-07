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

void testCreateCrrBaseTable()
{
}

void testCreateViewOfCrr()
{
}

void cfsqlTestSuite() {
  printf("\e[47m\e[1;30mSuite: cfsql\e[0m\n");
  
  testCreateClockTable();
  testCreateCrrBaseTable();
  testCreateViewOfCrr();
}