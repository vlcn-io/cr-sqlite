#include "stmt-cache.h"

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "crsqlite.h"

int crsql_close(sqlite3 *db);
static void testGetTwiceReturnsCachedValue() {
  printf("GetTwiceReturnsCachedValue\n");

  sqlite3 *db;
  int rc = sqlite3_open(":memory:", &db);
  crsql_ExtData *pExtData = crsql_newExtData(db);
  assert(rc == SQLITE_OK);

  sqlite3_stmt *pStmt = crsql_getOrPrepareCachedStmt(
      db, pExtData, "some-key", "SELECT * FROM sqlite_master");
  sqlite3_stmt *pStmt2 = crsql_getOrPrepareCachedStmt(
      db, pExtData, "some-key", "SELECT * FROM sqlite_master");
  sqlite3_stmt *pStmt3 = crsql_getOrPrepareCachedStmt(
      db, pExtData, "some-other-key", "SELECT * FROM sqlite_master");

  assert(pStmt == pStmt2);
  assert(pStmt != pStmt3);
  crsql_clearStmtCache(db, pExtData);

  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void crsqlStmtCacheTestSuite() {
  printf("\e[47m\e[1;30mSuite: crsql_stmtCache\e[0m\n");

  testGetTwiceReturnsCachedValue();
}