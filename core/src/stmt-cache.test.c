#include "stmt-cache.h"

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "crsqlite.h"
#include "ext-data.h"

int crsql_close(sqlite3 *db);
static void testGetUncached() {
  printf("GetUncached\n");
  sqlite3 *db;
  int rc = sqlite3_open(":memory:", &db);
  crsql_ExtData *pExtData = crsql_newExtData(db);
  assert(rc == SQLITE_OK);

  assert(crsql_getCachedStmt(pExtData, "some key") == 0);

  crsql_freeExtData(pExtData);
  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testGetCached() {
  printf("GetCached\n");

  sqlite3 *db;
  int rc = sqlite3_open(":memory:", &db);
  crsql_ExtData *pExtData = crsql_newExtData(db);
  assert(rc == SQLITE_OK);

  sqlite3_stmt *pStmt = 0;
  rc = sqlite3_prepare_v2(db, "SELECT * FROM sqlite_master", -1, &pStmt, 0);
  assert(rc == SQLITE_OK);

  assert(crsql_getCachedStmt(pExtData, "some key") == 0);
  crsql_setCachedStmt(pExtData, sqlite3_mprintf("some key"), pStmt);
  sqlite3_stmt *pCached = crsql_getCachedStmt(pExtData, "some key");
  assert(pCached == pStmt);

  crsql_freeExtData(pExtData);
  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void crsqlStmtCacheTestSuite() {
  printf("\e[47m\e[1;30mSuite: crsql_stmtCache\e[0m\n");

  testGetUncached();
  testGetCached();
}

// test finalization of statements
// test get uncached
// test get cached
// test put cache