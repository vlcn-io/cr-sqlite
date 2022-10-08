#include "cfsqlite-triggers.h"
#include "cfsqlite-tableinfo.h"

#include <stdint.h>
#include <string.h>

int cfsql_createCrrViewTriggers(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err)
{
  char *zSql;
  char *baseColumnsList = 0;
  char *baseColumnsNewList = 0;
  char *conflictResolution = 0;
  char *updateClocks = 0;

  baseColumnsList = cfsql_asIdentifierList(tableInfo->baseCols, tableInfo->baseColsLen, 0);
  baseColumnsNewList = cfsql_asIdentifierList(tableInfo->baseCols, tableInfo->baseColsLen, "NEW.");
  // conflictResolution = cfsql_localInsertConflictResolution();

  zSql = sqlite3_mprintf(
    "CREATE TRIGGER \"%s__cfsql_itrig\"\
      INSTEAD OF INSERT ON \"%s\"\
    BEGIN\
      INSERT INTO \"%s__cfsql_crr\" (\
        %s\
      ) VALUES (\
        %s\
      ) %s;\
      %s\
    END;",
    tableInfo->tblName,
    tableInfo->tblName,
    tableInfo->tblName,
    baseColumnsList,
    baseColumnsNewList,
    conflictResolution,
    updateClocks
  );
  sqlite3_free(zSql);

  return 0;
}

int cfsql_createPatchTrigger(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err)
{
  return 0;
}
