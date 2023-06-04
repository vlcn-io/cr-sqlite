/**
 * Test that:
 * 1. The rowid we return for a row on insert matches the rowid we get for it on
 * read
 * 2. That we can query the vtab by rowid??
 * 3. The returned rowid matches the rowid used in a point query by rowid
 * 4.
 */

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "crsqlite.h"

int crsql_close(sqlite3 *db);

static void testRowidForInsert() {
  printf("RowidForInsert\n");

  sqlite3 *db;
  int rc;
  rc = sqlite3_open(":memory:", &db);

  rc = sqlite3_exec(db, "CREATE TABLE foo (a primary key, b);", 0, 0, 0);
  rc += sqlite3_exec(db, "SELECT crsql_as_crr('foo');", 0, 0, 0);
  assert(rc == SQLITE_OK);

  char *zSql =
      "INSERT INTO crsql_changes ([table], pk, cid, val, col_version, "
      "db_version) "
      "VALUES "
      "('foo', '1', 'b', '1', 1, 1);";
  sqlite3_stmt *pStmt;
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  assert(rc == SQLITE_OK);
  assert(sqlite3_step(pStmt) == SQLITE_DONE);
  assert(sqlite3_last_insert_rowid(db) == 1);
  sqlite3_finalize(pStmt);

  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testRowidsForReads() {
  printf("RowidForReads\n");

  sqlite3 *db;
  int rc;
  rc = sqlite3_open(":memory:", &db);

  rc = sqlite3_exec(db, "CREATE TABLE foo (a primary key, b);", 0, 0, 0);
  rc += sqlite3_exec(db, "SELECT crsql_as_crr('foo');", 0, 0, 0);
  assert(rc == SQLITE_OK);

  // Insert some rows into foo
  // Check that we get rowids in the correct order after the insertion(s)
  sqlite3_exec(db, "INSERT INTO foo (a, b) VALUES (1, 1);", 0, 0, 0);

  char *zSql =
      "SELECT _rowid_ FROM crsql_changes WHERE [table] = 'foo' AND pk = '1'";
  sqlite3_stmt *pStmt;
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  assert(rc == SQLITE_OK);
  assert(sqlite3_step(pStmt) == SQLITE_ROW);
  assert(sqlite3_column_int64(pStmt, 0) == 1);
  sqlite3_finalize(pStmt);

  // now many inserts in a single tx
  sqlite3_exec(db, "BEGIN;", 0, 0, 0);
  sqlite3_exec(db, "INSERT INTO foo (a, b) VALUES (2, 2);", 0, 0, 0);
  sqlite3_exec(db, "INSERT INTO foo (a, b) VALUES (3, 3);", 0, 0, 0);
  sqlite3_exec(db, "INSERT INTO foo (a, b) VALUES (4, 4);", 0, 0, 0);
  sqlite3_exec(db, "COMMIT;", 0, 0, 0);

  zSql = "SELECT _rowid_ FROM crsql_changes WHERE [table] = 'foo' AND pk = '2'";
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  assert(rc == SQLITE_OK);
  assert(sqlite3_step(pStmt) == SQLITE_ROW);
  assert(sqlite3_column_int64(pStmt, 0) == 2);
  sqlite3_finalize(pStmt);

  zSql = "SELECT _rowid_ FROM crsql_changes WHERE [table] = 'foo' AND pk = '3'";
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  assert(rc == SQLITE_OK);
  assert(sqlite3_step(pStmt) == SQLITE_ROW);
  assert(sqlite3_column_int64(pStmt, 0) == 3);
  sqlite3_finalize(pStmt);

  zSql = "SELECT _rowid_ FROM crsql_changes WHERE [table] = 'foo' AND pk = '4'";
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  assert(rc == SQLITE_OK);
  assert(sqlite3_step(pStmt) == SQLITE_ROW);
  assert(sqlite3_column_int64(pStmt, 0) == 4);
  sqlite3_finalize(pStmt);

  // do rest of tests in python
  // - migration to compact out rowids and ensure we get the right ones back
  // - merge changes and check rowids change
  // - check that we can query the vtab by rowid

  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testInsertRowidMatchesReadRowid() {
  printf("RowidForInsertMatchesRowidForRead\n");

  sqlite3 *db;
  int rc;
  rc = sqlite3_open(":memory:", &db);

  rc = sqlite3_exec(db, "CREATE TABLE foo (a primary key, b);", 0, 0, 0);
  rc += sqlite3_exec(db, "SELECT crsql_as_crr('foo');", 0, 0, 0);
  assert(rc == SQLITE_OK);

  char *zSql =
      "INSERT INTO crsql_changes ([table], pk, cid, val, col_version, "
      "db_version) "
      "VALUES "
      "('foo', '1', 'b', '1', 1, 1);";
  sqlite3_stmt *pStmt;
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  assert(rc == SQLITE_OK);
  assert(sqlite3_step(pStmt) == SQLITE_DONE);
  assert(sqlite3_last_insert_rowid(db) == 1);
  sqlite3_finalize(pStmt);

  zSql = "SELECT _rowid_ FROM crsql_changes WHERE [table] = 'foo' AND pk = '1'";
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  assert(rc == SQLITE_OK);
  assert(sqlite3_step(pStmt) == SQLITE_ROW);
  assert(sqlite3_column_int64(pStmt, 0) == 1);
  sqlite3_finalize(pStmt);

  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void crsqlChangesVtabRowidTestSuite() {
  printf("\e[47m\e[1;30mSuite: crsql_changesVtabRowid\e[0m\n");
  testRowidForInsert();
  testRowidsForReads();
  testInsertRowidMatchesReadRowid();
}