#include "cfsqlite.h"
#include "cfsqlite-tableinfo.h"
#include "cfsqlite-triggers.h"
#include "cfsqlite-util.h"
#include "cfsqlite-consts.h"
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

// This would be more testable if we could test
// query construction rather than actual table creation.
// testing actual table creation requires views and base crr to
// be in place.
void testCreateInsertAndUpdateTriggers()
{
  printf("CreateInsertAndUpdateTriggers\n");

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
    rc = cfsql_createCrrBaseTable(db, tableInfo, &errMsg);
  }
  if (rc == SQLITE_OK)
  {
    rc = cfsql_createViewOfCrr(db, tableInfo, &errMsg);
  }
  if (rc == SQLITE_OK)
  {
    rc = cfsql_createInsertTrigger(db, tableInfo, &errMsg);
  }
  if (rc == SQLITE_OK)
  {
    rc = cfsql_createUpdateTrigger(db, tableInfo, &errMsg);
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

void testConflictSetsStr()
{
}

void testLocalInsertOnConflictStr()
{
}

void testUpdateClocksStr()
{
}

void testUpTrigWhereConditions()
{
  printf("CreateUpTrigWhereConditions\n");

  cfsql_ColumnInfo columnInfos[2];
  columnInfos[0].cid = 0;
  columnInfos[0].dfltValue = 0;
  columnInfos[0].name = "a";
  columnInfos[0].pk = 1;

  columnInfos[1].cid = 1;
  columnInfos[1].dfltValue = 0;
  columnInfos[1].name = "b";
  columnInfos[1].pk = 0;

  char *conditions = cfsql_upTrigWhereConditions(columnInfos, 2);

  assert(strcmp("\"a\" = NEW.\"a\" AND \"b\" = NEW.\"b\"", conditions) == 0);
  sqlite3_free(conditions);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testUpTrigSets()
{
  printf("CreateUpTrigSets\n");

  cfsql_ColumnInfo columnInfos[3];
  columnInfos[0].cid = 0;
  columnInfos[0].dfltValue = 0;
  columnInfos[0].name = "a";
  columnInfos[0].pk = 1;
  columnInfos[0].versionOf = 0;

  columnInfos[1].cid = 1;
  columnInfos[1].dfltValue = 0;
  columnInfos[1].name = "b";
  columnInfos[1].pk = 0;
  columnInfos[1].versionOf = 0;

  columnInfos[2].cid = 2;
  columnInfos[2].dfltValue = 0;
  columnInfos[2].name = "b_v";
  columnInfos[2].pk = 0;
  columnInfos[2].versionOf = "b";

  char *sets = cfsql_upTrigSets(columnInfos, 3);

  assert(
      strcmp(
          "\"a\" = NEW.\"a\",\"b\" = NEW.\"b\",\"b_v\" = CASE WHEN OLD.\"b\" != NEW.\"b\" THEN \"b_v\" + 1 ELSE \"b_v\" END",
          sets) == 0);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void cfsqlTriggersTestSuite()
{
  printf("\e[47m\e[1;30mSuite: cfsqlTriggers\e[0m\n");

  testCreateInsertAndUpdateTriggers();
  testUpTrigWhereConditions();
  testUpTrigSets();
}