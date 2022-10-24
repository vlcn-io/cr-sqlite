#include "crsqlite.h"
SQLITE_EXTENSION_INIT1

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

void testCreateClockTable()
{
  printf("CreateClockTable\n");

  sqlite3 *db;
  int rc;
  crsql_TableInfo *tc1;
  crsql_TableInfo *tc2;
  crsql_TableInfo *tc3;
  crsql_TableInfo *tc4;
  char *err = 0;

  rc = sqlite3_open(":memory:", &db);
  sqlite3_exec(db, "CREATE TABLE foo (a)", 0, 0, 0);
  sqlite3_exec(db, "CREATE TABLE bar (a primary key)", 0, 0, 0);
  sqlite3_exec(db, "CREATE TABLE baz (a primary key, b)", 0, 0, 0);
  sqlite3_exec(db, "CREATE TABLE boo (a primary key, b, c)", 0, 0, 0);

  rc = crsql_getTableInfo(db, "foo", &tc1, &err);
  CHECK_OK
  rc = crsql_getTableInfo(db, "bar", &tc2, &err);
  CHECK_OK
  rc = crsql_getTableInfo(db, "baz", &tc3, &err);
  CHECK_OK
  rc = crsql_getTableInfo(db, "boo", &tc4, &err);
  CHECK_OK

  rc = crsql_createClockTable(db, tc1, &err);
  CHECK_OK
  rc = crsql_createClockTable(db, tc2, &err);
  CHECK_OK
  rc = crsql_createClockTable(db, tc3, &err);
  CHECK_OK
  rc = crsql_createClockTable(db, tc4, &err);
  CHECK_OK

  // TODO: check that the tables have the expected schema

  printf("\t\e[0;32mSuccess\e[0m\n");
  sqlite3_close(db);
  return;

fail:
  printf("err: %s %d\n", err, rc);
  sqlite3_free(err);
  sqlite3_close(db);
  assert(rc == SQLITE_OK);
}

void teste2e()
{
  printf("e2e\n");

  int rc = SQLITE_OK;
  sqlite3 *db;
  char *err = 0;
  rc = sqlite3_open(":memory:", &db);

  rc = sqlite3_exec(db, "create table foo (a primary key, b);", 0, 0, &err);
  CHECK_OK
  rc = sqlite3_exec(db, "select crsql_as_crr('foo');", 0, 0, &err);
  CHECK_OK

  printf("\t\e[0;32mSuccess\e[0m\n");
  return;

fail:
  printf("err: %s %d\n", err, rc);
  sqlite3_free(err);
  sqlite3_close(db);
  assert(rc == SQLITE_OK);
}

void crsqlTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsql\e[0m\n");

  testCreateClockTable();
  teste2e();
  // testIdempotence();
  // testColumnAdds();
  // testColumnDrops();
  // testRecreateCrrFromExisting();
  // testRequiredPrimaryKey();
}