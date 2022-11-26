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

int crsql_close(sqlite3 *db);

static void testCreateClockTable()
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
  sqlite3_exec(db, "CREATE TABLE foo (a, b, primary key (a, b))", 0, 0, 0);
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

  crsql_freeTableInfo(tc1);
  crsql_freeTableInfo(tc2);
  crsql_freeTableInfo(tc3);
  crsql_freeTableInfo(tc4);

  // TODO: check that the tables have the expected schema

  printf("\t\e[0;32mSuccess\e[0m\n");
  crsql_close(db);
  return;

fail:
  printf("err: %s %d\n", err, rc);
  sqlite3_free(err);
  crsql_close(db);
  assert(rc == SQLITE_OK);
}

// TODO: add many more cases here.
// 1. Many pk tables
// 2. Only pk tables
// 3. blobs, floats, text, bools, sci notation
// 4. deletes
// 5. pk value changes
static void teste2e()
{
  printf("e2e\n");

  int rc = SQLITE_OK;
  sqlite3 *db;
  sqlite3_stmt *pStmt1;
  sqlite3_stmt *pStmt2;
  char *err = 0;
  rc = sqlite3_open(":memory:", &db);

  rc += sqlite3_exec(db, "create table foo (a primary key, b);", 0, 0, &err);
  rc += sqlite3_exec(db, "select crsql_as_crr('foo');", 0, 0, &err);
  rc += sqlite3_exec(db, "insert into foo values (1, 2.0e2);", 0, 0, &err);

  sqlite3 *db2;
  rc = sqlite3_open(":memory:", &db2);
  assert(rc == SQLITE_OK);

  rc = sqlite3_prepare_v2(db, "SELECT * FROM crsql_changes", -1, &pStmt1, 0);
  assert(rc == SQLITE_OK);
  rc = sqlite3_prepare_v2(db, "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?)", -1, &pStmt2, 0);
  assert(rc == SQLITE_OK);

  while (sqlite3_step(pStmt1) == SQLITE_ROW)
  {
    for (int i = 0; i < 6; ++i)
    {
      sqlite3_bind_value(pStmt2, i + 1, sqlite3_column_value(pStmt1, i));
    }

    sqlite3_step(pStmt2);
    sqlite3_reset(pStmt2);
  }
  sqlite3_finalize(pStmt1);
  sqlite3_finalize(pStmt2);

  rc += sqlite3_prepare_v2(db, "SELECT * FROM foo", -1, &pStmt1, 0);
  rc += sqlite3_prepare_v2(db, "SELECT * FROM foo", -1, &pStmt2, 0);
  assert(rc == SQLITE_OK);

  int didCompare = 0;
  while (sqlite3_step(pStmt1) == SQLITE_ROW)
  {
    rc = sqlite3_step(pStmt2);
    assert(rc == SQLITE_ROW);

    assert(sqlite3_column_int(pStmt1, 0) == sqlite3_column_int(pStmt2, 0));
    assert(sqlite3_column_double(pStmt1, 1) == sqlite3_column_double(pStmt2, 1));

    didCompare = 1;
  }
  sqlite3_finalize(pStmt1);
  sqlite3_finalize(pStmt2);

  assert(didCompare == 1);

  crsql_close(db);
  crsql_close(db2);
  printf("\t\e[0;32mSuccess\e[0m\n");
  return;
}

static void testSelectChangesAfterChangingColumnName()
{
  printf("SelectAfterChangeingColumnName\n");

  int rc = SQLITE_OK;
  char *err = 0;
  sqlite3 *db;
  sqlite3_stmt *pStmt = 0;
  rc = sqlite3_open(":memory:", &db);

  rc += sqlite3_exec(db, "CREATE TABLE foo(a primary key, b);", 0, 0, 0);
  rc += sqlite3_exec(db, "SELECT crsql_as_crr('foo')", 0, 0, 0);
  assert(rc == SQLITE_OK);

  // insert some rows so we have changes
  rc += sqlite3_exec(db, "INSERT INTO foo VALUES (1, 2);", 0, 0, 0);
  assert(rc == SQLITE_OK);

  rc = sqlite3_exec(db, "SELECT crsql_begin_alter('foo')", 0, 0, &err);
  rc += sqlite3_exec(db, "ALTER TABLE foo DROP COLUMN b", 0, 0, 0);
  rc += sqlite3_exec(db, "ALTER TABLE foo ADD COLUMN c", 0, 0, 0);
  rc += sqlite3_exec(db, "SELECT crsql_commit_alter('foo')", 0, 0, 0);
  assert(rc == SQLITE_OK);

  rc += sqlite3_prepare_v2(db, "SELECT * FROM crsql_changes", -1, &pStmt, 0);
  assert(rc == SQLITE_OK);
  int numRows = 0;
  // Columns that no long exist post-alter should not
  // be retained for replication
  while ((rc = sqlite3_step(pStmt)) == SQLITE_ROW)
  {
    ++numRows;
  }
  sqlite3_finalize(pStmt);
  assert(numRows == 0);
  assert(rc == SQLITE_DONE);

  // insert some rows post schema change
  rc = sqlite3_exec(db, "INSERT INTO foo VALUES (2, 3);", 0, 0, 0);
  rc += sqlite3_prepare_v2(db, "SELECT * FROM crsql_changes", -1, &pStmt, 0);
  assert(rc == SQLITE_OK);
  numRows = 0;
  // Columns that no long exist post-alter should not
  // be retained for replication
  while ((rc = sqlite3_step(pStmt)) == SQLITE_ROW)
  {
    assert(strcmp("foo", (const char *)sqlite3_column_text(pStmt, 0)) == 0);
    assert(strcmp("2", (const char *)sqlite3_column_text(pStmt, 1)) == 0);
    assert(strcmp("c", (const char *)sqlite3_column_text(pStmt, 2)) == 0);
    assert(strcmp("3", (const char *)sqlite3_column_text(pStmt, 3)) == 0);
    ++numRows;
  }
  sqlite3_finalize(pStmt);
  assert(numRows == 1);
  assert(rc == SQLITE_DONE);

  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testInsertChangesWithUnkownColumnNames()
{
  printf("InsertChangesWithUnknownColumnName\n");

  int rc = SQLITE_OK;
  char *err = 0;
  sqlite3 *db1;
  sqlite3 *db2;
  rc = sqlite3_open(":memory:", &db1);
  rc += sqlite3_open(":memory:", &db2);

  rc += sqlite3_exec(db1, "CREATE TABLE foo(a primary key, b);", 0, 0, 0);
  rc += sqlite3_exec(db1, "SELECT crsql_as_crr('foo')", 0, 0, 0);
  rc += sqlite3_exec(db2, "CREATE TABLE foo(a primary key, c);", 0, 0, 0);
  rc += sqlite3_exec(db2, "SELECT crsql_as_crr('foo')", 0, 0, 0);
  assert(rc == SQLITE_OK);

  rc += sqlite3_exec(db1, "INSERT INTO foo VALUES (1, 2);", 0, 0, 0);
  rc += sqlite3_exec(db2, "INSERT INTO foo VALUES (2, 3);", 0, 0, 0);
  assert(rc == SQLITE_OK);

  sqlite3_stmt *pStmtRead = 0;
  sqlite3_stmt *pStmtWrite = 0;
  rc += sqlite3_prepare_v2(db1, "SELECT * FROM crsql_changes", -1, &pStmtRead, 0);
  rc += sqlite3_prepare_v2(db2, "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?)", -1, &pStmtWrite, 0);
  assert(rc == SQLITE_OK);

  while (sqlite3_step(pStmtRead) == SQLITE_ROW)
  {
    for (int i = 0; i < 6; ++i)
    {
      sqlite3_bind_value(pStmtWrite, i + 1, sqlite3_column_value(pStmtRead, i));
    }

    sqlite3_step(pStmtWrite);
    sqlite3_reset(pStmtWrite);
  }
  sqlite3_finalize(pStmtWrite);
  sqlite3_finalize(pStmtRead);

  // select all from db2.
  // it should have a row for pk 1.
  sqlite3_prepare_v2(db2, "SELECT * FROM foo ORDER BY a ASC", -1, &pStmtRead, 0);
  int comparisons = 0;
  while (sqlite3_step(pStmtRead) == SQLITE_ROW)
  {
    if (comparisons == 0)
    {
      assert(sqlite3_column_int(pStmtRead, 0) == 1);
      assert(sqlite3_column_type(pStmtRead, 1) == SQLITE_NULL);
    }
    else
    {
      assert(sqlite3_column_int(pStmtRead, 0) == 2);
      assert(sqlite3_column_int(pStmtRead, 1) == 3);
    }
    comparisons += 1;
  }
  sqlite3_finalize(pStmtRead);

  assert(comparisons == 2);
  crsql_close(db1);
  crsql_close(db2);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static sqlite3_int64 getDbVersion(sqlite3 *db)
{
  sqlite3_stmt *pStmt = 0;
  int rc = sqlite3_prepare_v2(db, "SELECT crsql_dbversion()", -1, &pStmt, 0);
  if (rc != SQLITE_OK)
  {
    return -1;
  }

  sqlite3_step(pStmt);
  sqlite3_int64 db2v = sqlite3_column_int64(pStmt, 0);
  sqlite3_finalize(pStmt);

  return db2v;
}

/**
 * @brief selects * from db1 changes where v > since and site_id is not db2_site_id
 * then inserts those changes into db2
 * 
 * @param db1 
 * @param db2 
 * @param since 
 * @return int 
 */
static int syncLeftToRight(sqlite3 *db1, sqlite3 *db2, sqlite3_int64 since)
{
  sqlite3_stmt *pStmtRead = 0;
  sqlite3_stmt *pStmtWrite = 0;
  sqlite3_stmt *pStmt = 0;
  int rc = SQLITE_OK;

  rc += sqlite3_prepare_v2(db2, "SELECT crsql_siteid()", -1, &pStmt, 0);
  if (sqlite3_step(pStmt) != SQLITE_ROW) {
    sqlite3_finalize(pStmt);
    return SQLITE_ERROR;
  }

  char *zSql = sqlite3_mprintf("SELECT * FROM crsql_changes WHERE version > %lld AND site_id IS NOT ?", since);
  rc += sqlite3_prepare_v2(
      db1, zSql, -1, &pStmtRead, 0);
  sqlite3_free(zSql);
  rc += sqlite3_bind_value(pStmtRead, 1, sqlite3_column_value(pStmt, 0));
  rc += sqlite3_prepare_v2(
    db2, "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?)", -1, &pStmtWrite, 0);
  assert(rc == SQLITE_OK);

  while (sqlite3_step(pStmtRead) == SQLITE_ROW)
  {
    for (int i = 0; i < 6; ++i)
    {
      sqlite3_bind_value(pStmtWrite, i + 1, sqlite3_column_value(pStmtRead, i));
    }
    sqlite3_step(pStmtWrite);
    sqlite3_reset(pStmtWrite);
  }

  sqlite3_finalize(pStmtWrite);
  sqlite3_finalize(pStmtRead);
  sqlite3_finalize(pStmt);

  return SQLITE_OK;
}

static void testLamportCondition()
{
  printf("LamportCondition\n");
  // syncing from A -> B, while no changes happen on B, moves up
  // B's clock still.

  sqlite3 *db1;
  sqlite3 *db2;
  int rc = SQLITE_OK;

  rc += sqlite3_open(":memory:", &db1);
  rc += sqlite3_open(":memory:", &db2);

  rc += sqlite3_exec(db1, "CREATE TABLE \"hoot\" (\"a\", \"b\" primary key, \"c\")", 0, 0, 0);
  rc += sqlite3_exec(db2, "CREATE TABLE \"hoot\" (\"a\", \"b\" primary key, \"c\")", 0, 0, 0);
  rc += sqlite3_exec(db1, "SELECT crsql_as_crr('hoot');", 0, 0, 0);
  rc += sqlite3_exec(db2, "SELECT crsql_as_crr('hoot');", 0, 0, 0);
  assert(rc == SQLITE_OK);

  rc += sqlite3_exec(db1, "INSERT INTO hoot VALUES (1, 1, 1);", 0, 0, 0);
  rc += sqlite3_exec(db1, "UPDATE hoot SET a = 1 WHERE b = 1;", 0, 0, 0);
  rc += sqlite3_exec(db1, "UPDATE hoot SET a = 2 WHERE b = 1;", 0, 0, 0);
  rc += sqlite3_exec(db1, "UPDATE hoot SET a = 3 WHERE b = 1;", 0, 0, 0);
  assert(rc == SQLITE_OK);

  rc += syncLeftToRight(db1, db2, 0);
  assert(rc == SQLITE_OK);

  sqlite3_int64 db1v = getDbVersion(db1);
  sqlite3_int64 db2v = getDbVersion(db2);

  assert(db1v > 0);
  assert(db1v == db2v);

  // now update col c on db2
  // and sync right to left
  // change should be taken
  rc += sqlite3_exec(db2, "UPDATE hoot SET c = 33 WHERE b = 1", 0, 0, 0);
  rc += syncLeftToRight(db2, db1, db2v);

  sqlite3_stmt *pStmt = 0;
  sqlite3_prepare_v2(db1, "SELECT c FROM hoot WHERE b = 1", -1, &pStmt, 0);
  rc = sqlite3_step(pStmt);
  assert(rc == SQLITE_ROW);
  assert(sqlite3_column_int(pStmt, 0) == 33);
  sqlite3_finalize(pStmt);

  rc = crsql_close(db1);
  assert(rc == SQLITE_OK);
  rc += crsql_close(db2);
  assert(rc == SQLITE_OK);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void noopsDoNotMoveClocks()
{
}

static void testModifySinglePK()
{
}

static void testModifyCompoundPK()
{
}

void crsqlTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsql\e[0m\n");

  testCreateClockTable();
  // testSyncBit();
  teste2e();
  testSelectChangesAfterChangingColumnName();
  testInsertChangesWithUnkownColumnNames();
  testLamportCondition();

  // testIdempotence();
  // testColumnAdds();
  // testColumnDrops();
  // testRecreateCrrFromExisting();
  // testRequiredPrimaryKey();
  // testSyncBit();
  // testDbVersion();
  // testSiteId();
  // test all the new logic around perDbData
  // getting, freeing, reusing, releasing, refcounting, etc.
}