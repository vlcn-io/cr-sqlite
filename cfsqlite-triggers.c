#include "cfsqlite-triggers.h"
#include "cfsqlite-tableinfo.h"

#include <stdint.h>
#include <string.h>

char *cfsql_conflictSetsStr(cfsql_ColumnInfo *cols, int len)
{
  return 0;
}

char *cfsql_localInsertConflictResolutionStr(cfsql_TableInfo *tableInfo)
{
  if (tableInfo->pksLen == 0)
  {
    // dup given the caller would try to deallocate it and we
    // cannot deallocate a literal
    return strdup("");
  }

  char *pkList = cfsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, 0);
  char *conflictSets = cfsql_conflictSetsStr(tableInfo->nonPks, tableInfo->nonPksLen);

  char *ret = sqlite3_mprintf(
      "ON CONFLICT (%s) DO UPDATE SET\
      %s\
    \"__cfsql_cl\" = CASE WHEN \"__cfsql_cl\" % 2 = 0 THEN \"__cfsql_cl\" + 1 ELSE \"__cfsql_cl\" END,\
    \"__cfsql_src\" = 0",
      pkList,
      conflictSets);

  sqlite3_free(pkList);
  sqlite3_free(conflictSets);

  return ret;
}

char *cfsql_updateClocksStr(cfsql_TableInfo *tableInfo)
{
  return 0;
}

int cfsql_createInsertTrigger(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err)
{
  char *zSql;
  char *baseColumnsList = 0;
  char *baseColumnsNewList = 0;
  char *conflictResolution = 0;
  char *updateClocks = 0;
  int rc = SQLITE_OK;

  baseColumnsList = cfsql_asIdentifierList(tableInfo->baseCols, tableInfo->baseColsLen, 0);
  baseColumnsNewList = cfsql_asIdentifierList(tableInfo->baseCols, tableInfo->baseColsLen, "NEW.");
  conflictResolution = cfsql_localInsertConflictResolutionStr(tableInfo);
  updateClocks = cfsql_updateClocksStr(tableInfo);

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
      updateClocks);
  rc = sqlite3_exec(db, zSql, 0, 0, err);

  sqlite3_free(zSql);
  sqlite3_free(baseColumnsList);
  sqlite3_free(baseColumnsNewList);
  sqlite3_free(conflictResolution);
  sqlite3_free(updateClocks);

  return rc;
}

int cfsql_createUpdateTrigger(sqlite3 *db,
                              cfsql_TableInfo *tableInfo,
                              char **err)
{
  return SQLITE_OK;
}

int cfsql_createDeleteTrigger(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err)
{
  // char *zSql = sqlite3_mprintf(
  //   "CREATE TRIGGER"
  // );
  return SQLITE_OK;
}

int cfsql_createCrrViewTriggers(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err)
{

  int rc = cfsql_createInsertTrigger(db, tableInfo, err);
  if (rc == SQLITE_OK)
  {
    rc = cfsql_createUpdateTrigger(db, tableInfo, err);
  }
  if (rc == SQLITE_OK)
  {
    rc = cfsql_createDeleteTrigger(db, tableInfo, err);
  }

  return rc;
}

int cfsql_createPatchTrigger(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err)
{
  return 0;
}
