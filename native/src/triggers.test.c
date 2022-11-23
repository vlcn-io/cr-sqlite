#include "crsqlite.h"
#include "tableinfo.h"
#include "triggers.h"
#include "util.h"
#include "consts.h"
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

void crsql_close(sqlite3* db);

// This would be more testable if we could test
// query construction rather than actual table creation.
// testing actual table creation requires views and base crr to
// be in place.
static void testCreateTriggers()
{
  printf("CreateTriggers\n");

  sqlite3 *db = 0;
  crsql_TableInfo *tableInfo;
  char *errMsg = 0;
  int rc = sqlite3_open(":memory:", &db);

  rc = sqlite3_exec(
      db,
      "CREATE TABLE \"foo\" (\"a\" PRIMARY KEY, \"b\", \"c\")",
      0,
      0,
      &errMsg);
  rc = crsql_getTableInfo(db, "foo", &tableInfo, &errMsg);

  if (rc == SQLITE_OK)
  {
    rc = crsql_createInsertTrigger(db, tableInfo, &errMsg);
  }
  if (rc == SQLITE_OK)
  {
    rc = crsql_createUpdateTrigger(db, tableInfo, &errMsg);
  }
  if (rc == SQLITE_OK)
  {
    rc = crsql_createDeleteTrigger(db, tableInfo, &errMsg);
  }

  crsql_freeTableInfo(tableInfo);
  if (rc != SQLITE_OK)
  {
    crsql_close(db);
    printf("err: %s | rc: %d\n", errMsg, rc);
    sqlite3_free(errMsg);
    assert(0);
  }

  sqlite3_free(errMsg);
  crsql_close(db);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testDeleteTriggerQuery()
{
  printf("DeleteTriggerQuery\n");
  sqlite3 *db = 0;
  crsql_TableInfo *tableInfo;
  char *errMsg = 0;
  int rc = sqlite3_open(":memory:", &db);

  rc += sqlite3_exec(
      db,
      "CREATE TABLE \"foo\" (\"a\" PRIMARY KEY, \"b\", \"c\")",
      0,
      0,
      &errMsg);
  rc += crsql_getTableInfo(db, "foo", &tableInfo, &errMsg);
  rc += sqlite3_exec(
      db,
      "DROP TABLE foo",
      0,
      0,
      &errMsg);

  char *query = crsql_deleteTriggerQuery(tableInfo);
  assert(strcmp("CREATE TRIGGER IF NOT EXISTS \"foo__crsql_dtrig\"      AFTER DELETE ON \"foo\"    BEGIN      INSERT OR REPLACE INTO \"foo__crsql_clock\" (        \"a\",        __crsql_col_name,        __crsql_version,        __crsql_site_id      ) SELECT         OLD.\"a\",        -1,        crsql_nextdbversion(),        NULL      WHERE crsql_internal_sync_bit() = 0;    END;", query) == 0);

  crsql_freeTableInfo(tableInfo);
  crsql_close(db);
  sqlite3_free(query);
  assert(rc == SQLITE_OK);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testInsertTriggerQuery()
{
  printf("InsertTriggerQuery\n");
  sqlite3 *db = 0;
  crsql_TableInfo *tableInfo;
  char *errMsg = 0;
  int rc = sqlite3_open(":memory:", &db);

  rc = sqlite3_exec(
    db,
    "CREATE TABLE \"foo\" (\"a\", \"b\", \"c\", PRIMARY KEY (\"a\", \"b\"))",
    0,
    0,
    &errMsg);
  rc = crsql_getTableInfo(db, "foo", &tableInfo, &errMsg);

  char *query = crsql_insertTriggerQuery(tableInfo, "a, b", "NEW.a, NEW.b");

  char *expected = "INSERT OR REPLACE INTO \"foo__crsql_clock\" (        a, b,        __crsql_col_name,        __crsql_version,        __crsql_site_id      ) SELECT         NEW.a, NEW.b,        2,        crsql_nextdbversion(),        NULL      WHERE crsql_internal_sync_bit() = 0;\n";

  assert(strcmp(expected, query) == 0);

  crsql_freeTableInfo(tableInfo);
  crsql_close(db);
  sqlite3_free(query);
}

void crsqlTriggersTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsqlTriggers\e[0m\n");

  testDeleteTriggerQuery();
  testCreateTriggers();
  testInsertTriggerQuery();
  // testTriggerSyncBitInteraction();
}