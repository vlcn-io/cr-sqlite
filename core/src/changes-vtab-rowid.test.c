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

// static void testRowidForInsert() {
//   printf("RowidForInsert\n");

//   sqlite3 *db;
//   int rc;
//   rc = sqlite3_open(":memory:", &db);

//   rc = sqlite3_exec(db, "CREATE TABLE foo (a primary key, b);", 0, 0, 0);
//   rc += sqlite3_exec(db, "SELECT crsql_as_crr('foo');", 0, 0, 0);
//   assert(rc == SQLITE_OK);

//   char *zSql =
//       "INSERT INTO crsql_changes ([table], pk, cid, val, col_version, "
//       "db_version) "
//       "VALUES "
//       "('foo', '1', 'b', '1', 1, 1) RETURNING _rowid_;";
//   sqlite3_stmt *pStmt;
//   rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
//   assert(rc == SQLITE_OK);
//   assert(sqlite3_step(pStmt) == SQLITE_ROW);
//   printf("rowid: %d\n", sqlite3_column_int64(pStmt, 0));
//   assert(sqlite3_column_int64(pStmt, 0) == 1);
//   sqlite3_finalize(pStmt);

//   // TODO: make extra crr tables and check their slab allotments and returned
//   // rowids

//   crsql_close(db);
//   printf("\t\e[0;32mSuccess\e[0m\n");
// }

static void testRowidsForReads() {
  printf("RowidForReads\n");

  // sqlite3 *db;
  // int rc;
  // rc = sqlite3_open(":memory:", &db);

  // crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

// static void testInsertRowidMatchesReadRowid() {
//   printf("RowidForInsertMatchesRowidForRead\n");
//   printf("\t\e[0;32mSuccess\e[0m\n");
// }

void crsqlChangesVtabRowidTestSuite() {
  printf("\e[47m\e[1;30mSuite: crsql_changesVtabRowid\e[0m\n");
  // testRowidForInsert();
  testRowidsForReads();
  // testInsertRowidMatchesReadRowid();
}