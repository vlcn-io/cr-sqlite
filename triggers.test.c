#include "cfsqlite.h"
#include "tableinfo.h"
#include "triggers.h"
#include "util.h"
#include "consts.h"
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

// This would be more testable if we could test
// query construction rather than actual table creation.
// testing actual table creation requires views and base crr to
// be in place.
void testCreateViewTriggers()
{
  printf("CreateViewTriggers\n");

  sqlite3 *db = 0;
  cfsql_TableInfo *tableInfo;
  char *errMsg = 0;
  int rc = sqlite3_open(":memory:", &db);

  // TODO enumerate various table types
  rc = sqlite3_exec(
      db,
      "CREATE TABLE \"foo\" (\"a\" PRIMARY KEY, \"b\", \"c\")",
      0,
      0,
      &errMsg);
  rc = cfsql_getTableInfo(db, USER_SPACE, "foo", &tableInfo, &errMsg);
  rc = sqlite3_exec(
      db,
      "DROP TABLE foo",
      0,
      0,
      &errMsg);

  if (rc == SQLITE_OK)
  {
    rc = cfsql_createInsertTrigger(db, tableInfo, &errMsg);
  }
  if (rc == SQLITE_OK)
  {
    rc = cfsql_createUpdateTrigger(db, tableInfo, &errMsg);
  }
  if (rc == SQLITE_OK)
  {
    rc = cfsql_createDeleteTrigger(db, tableInfo, &errMsg);
  }

  cfsql_freeTableInfo(tableInfo);
  if (rc != SQLITE_OK)
  {
    sqlite3_close(db);
    printf("err: %s | rc: %d\n", errMsg, rc);
    sqlite3_free(errMsg);
    assert(0);
  }

  sqlite3_free(errMsg);
  sqlite3_close(db);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testLocalInsertOnConflictStr()
{
}

void testUpdateClocksStr()
{
}

void testDeleteTriggerQuery()
{
  printf("DeleteTriggerQuery\n");
  sqlite3 *db = 0;
  cfsql_TableInfo *tableInfo;
  char *errMsg = 0;
  int rc = sqlite3_open(":memory:", &db);

  rc += sqlite3_exec(
      db,
      "CREATE TABLE \"foo\" (\"a\" PRIMARY KEY, \"b\", \"c\")",
      0,
      0,
      &errMsg);
  rc += cfsql_getTableInfo(db, USER_SPACE, "foo", &tableInfo, &errMsg);
  rc += sqlite3_exec(
      db,
      "DROP TABLE foo",
      0,
      0,
      &errMsg);

  char *query = cfsql_deleteTriggerQuery(tableInfo);
  assert(strcmp("CREATE TRIGGER \"foo__cfsql_dtrig\"    INSTEAD OF DELETE ON \"foo\"    BEGIN      UPDATE \"foo__cfsql_crr\" SET \"__cfsql_cl\" = \"__cfsql_cl\" + 1, \"__cfsql_src\" = 0 WHERE \"a\" = OLD.\"a\";            INSERT INTO \"foo__cfsql_clock\" (\"__cfsql_site_id\", \"__cfsql_version\", \"a\")      VALUES (        cfsql_siteid(),        cfsql_dbversion(),        OLD.\"a\"      )      ON CONFLICT (\"__cfsql_site_id\", \"a\") DO UPDATE SET        \"__cfsql_version\" = EXCLUDED.\"__cfsql_version\";        END", query) == 0);

  sqlite3_close(db);
  assert(rc == SQLITE_OK);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void cfsqlTriggersTestSuite()
{
  printf("\e[47m\e[1;30mSuite: cfsqlTriggers\e[0m\n");

  testDeleteTriggerQuery();
  testCreateViewTriggers();
  // testUpTrigWhereConditions();
  // testUpTrigSets();
}