#include "crsqlite.h"
#include "changes-vtab.h"
#include "consts.h"
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

static void testManyPkTable()
{
  printf("ManyPkTable\n");

  sqlite3 *db;
  sqlite3_stmt *pStmt;
  int rc;
  int didChange = 0;
  rc = sqlite3_open(":memory:", &db);

  rc = sqlite3_exec(db, "CREATE TABLE foo (a, b, c, primary key (a, b));", 0, 0, 0);
  rc += sqlite3_exec(db, "SELECT crsql_as_crr('foo');", 0, 0, 0);
  rc += sqlite3_exec(db, "INSERT INTO foo VALUES (4,5,6);", 0,0,0);
  assert(rc == SQLITE_OK);

  int numChanges = 0;
  rc += sqlite3_prepare_v2(db, "SELECT * FROM crsql_changes()", -1, &pStmt, 0);
  assert(rc == SQLITE_OK);
  
  while (sqlite3_step(pStmt) == SQLITE_ROW) {
    const unsigned char *table = sqlite3_column_text(pStmt, 0);
    const unsigned char *pk = sqlite3_column_text(pStmt, 1);
    assert(strcmp("4|5", (char *)pk) == 0);
  }

  sqlite3_finalize(pStmt);
  sqlite3_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testSinglePksTable()
{
}

static void testOnlyPkTable()
{
}

static void testSciNotation()
{
}

static void testHex()
{
}

void crsqlChangesVtabTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsql_changesVtab\e[0m\n");
  testManyPkTable();
}
