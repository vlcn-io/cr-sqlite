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
void testCreateInsertTrigger()
{
  printf("CreateInsertTrigger\n");

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

  cfsql_freeTableInfo(tableInfo);
  if (rc != SQLITE_OK)
  {
    printf("err: %s | rc: %d\n", errMsg, rc);
    sqlite3_free(errMsg);
    assert(0);
  }
  
  sqlite3_free(errMsg);
  
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testConflictSetsStr() {

}

void testLocalInsertOnConflictStr() {

}

void testUpdateClocksStr() {
  
}

void testUpTrigWhereConditions() {
  printf("CreateInsertTrigger\n");

  cfsql_ColumnInfo columnInfos[2];
  columnInfos[0].cid = 0;
  columnInfos[0].dfltValue = 0;
  columnInfos[0].name = "a";
  columnInfos[0].pk = 1;

  columnInfos[1].cid = 1;
  columnInfos[1].dfltValue = 0;
  columnInfos[1].name = "b";
  columnInfos[1].pk = 0;

  char * conditions = cfsql_upTrigwhereConditions(columnInfos, 2);

  assert(strcmp("\"a\" = NEW.\"a\" AND \"b\" = NEW.\"b\"", conditions) == 0);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void cfsqlTriggersTestSuite()
{
  printf("\e[47m\e[1;30mSuite: cfsqlTriggers\e[0m\n");

  testCreateInsertTrigger();
  testUpTrigWhereConditions();
}