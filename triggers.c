#include "triggers.h"
#include "tableinfo.h"
#include "util.h"

#include <stdint.h>
#include <string.h>
#include <stdio.h>

char *cfsql_conflictSetsStr(cfsql_ColumnInfo *cols, int len)
{
  char *sets[len];
  int resultLen = 0;
  char *ret = 0;

  if (len == 0)
  {
    return ret;
  }

  for (int i = 0; i < len; ++i)
  {
    if (cols[i].versionOf != 0)
    {
      sets[i] = sqlite3_mprintf(
          "\"%s\" = CASE WHEN EXCLUDED.\"%s\" != \"%s\" THEN \"%s\" + 1 ELSE \"%s\" END",
          cols[i].name,
          cols[i].versionOf,
          cols[i].versionOf,
          cols[i].name,
          cols[i].name);
    }
    else
    {
      sets[i] = sqlite3_mprintf("\"%s\" = EXCLUDED.\"%s\"", cols[i].name, cols[i].name);
    }

    resultLen += strlen(sets[i]);
  }
  resultLen += len - 1;
  ret = sqlite3_malloc(resultLen * sizeof(char) + 1);
  ret[resultLen] = '\0';

  cfsql_joinWith(ret, sets, len, ',');

  for (int i = 0; i < len; ++i)
  {
    sqlite3_free(sets[i]);
  }

  return ret;
}

char *cfsql_localInsertOnConflictStr(cfsql_TableInfo *tableInfo)
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
      %s%s\
    \"__cfsql_cl\" = CASE WHEN \"__cfsql_cl\" %% 2 = 0 THEN \"__cfsql_cl\" + 1 ELSE \"__cfsql_cl\" END,\
    \"__cfsql_src\" = 0",
      pkList,
      conflictSets,
      tableInfo->nonPksLen == 0 ? "" : ",");

  sqlite3_free(pkList);
  sqlite3_free(conflictSets);

  return ret;
}

char *cfsql_updateClocksStr(cfsql_TableInfo *tableInfo, int isDelete)
{
  // TODO: if there are now pks we need to use a `rowid` col

  char *pkList = 0;
  char *pkNew = 0;

  if (tableInfo->pksLen == 0)
  {
    if (isDelete)
    {
      pkNew = "OLD.\"rowid\"";
    }
    else
    {
      pkNew = "NEW.\"rowid\"";
    }

    pkList = "\"rowid\"";
  }
  else
  {
    pkNew = cfsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, isDelete ? "OLD." : "NEW.");
    pkList = cfsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, 0);
  }

  char *ret = sqlite3_mprintf(
      "INSERT INTO \"%s__cfsql_clock\" (\"__cfsql_site_id\", \"__cfsql_version\", %s)\
      VALUES (\
        cfsql_siteid(),\
        cfsql_nextdbversion(),\
        %s\
      )\
      ON CONFLICT (\"__cfsql_site_id\", %s) DO UPDATE SET\
        \"__cfsql_version\" = EXCLUDED.\"__cfsql_version\";\
    ",
      tableInfo->tblName,
      pkList,
      pkNew,
      pkList);

  if (tableInfo->pksLen != 0)
  {
    sqlite3_free(pkNew);
    sqlite3_free(pkList);
  }

  return ret;
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
  conflictResolution = cfsql_localInsertOnConflictStr(tableInfo);
  updateClocks = cfsql_updateClocksStr(tableInfo, 0);

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

static char *mapPkWhere(const char *x)
{
  return sqlite3_mprintf("\"%s\" = NEW.\"%s\"", x, x);
}

// TODO: we could generalize this and `conflictSetsStr` and and `updateTrigUpdateSet` and other places
// if we add a parameter which is a function that produces the strings
// to join.
char *cfsql_upTrigWhereConditions(cfsql_ColumnInfo *columnInfo, int len)
{
  char *columnNames[len];
  for (int i = 0; i < len; ++i)
  {
    columnNames[i] = columnInfo[i].name;
  }

  return cfsql_join2(&mapPkWhere, columnNames, len, " AND ");
}

char *cfsql_upTrigSets(cfsql_ColumnInfo *columnInfo, int len)
{
  char *columnNames[len];
  for (int i = 0; i < len; ++i)
  {
    if (columnInfo[i].versionOf == 0)
    {
      columnNames[i] = sqlite3_mprintf("\"%s\" = NEW.\"%s\"", columnInfo[i].name, columnInfo[i].name);
    }
    else
    {
      columnNames[i] = sqlite3_mprintf(
          "\"%s\" = CASE WHEN OLD.\"%s\" != NEW.\"%s\" THEN \"%s\" + 1 ELSE \"%s\" END",
          columnInfo[i].name,
          columnInfo[i].versionOf,
          columnInfo[i].versionOf,
          columnInfo[i].name,
          columnInfo[i].name);
    }
  }

  // join2 will free the columnName entries.
  // This is because `cfsql_identity` is a pass through (identity function)
  // and does not allocate a new string, causing the original string to be freed by join2.
  char *ret = cfsql_join2((char *(*)(const char *)) & cfsql_identity, columnNames, len, ",");

  return ret;
}

int cfsql_createUpdateTrigger(sqlite3 *db,
                              cfsql_TableInfo *tableInfo,
                              char **err)
{
  char *zSql;
  char *sets = 0;
  char *pkWhereConditions = 0;
  char *clockUpdate = 0;
  int rc = SQLITE_OK;

  if (tableInfo->pksLen == 0)
  {
    pkWhereConditions = "\"rowid\" = NEW.\"rowid\"";
  }
  else
  {
    pkWhereConditions = cfsql_upTrigWhereConditions(tableInfo->pks, tableInfo->pksLen);
  }

  sets = cfsql_upTrigSets(tableInfo->withVersionCols, tableInfo->withVersionColsLen);
  clockUpdate = cfsql_updateClocksStr(tableInfo, 0);
  zSql = sqlite3_mprintf(
      "CREATE TRIGGER \"%s__cfsql_utrig\"\
      INSTEAD OF UPDATE ON \"%s\"\
    BEGIN\
      UPDATE \"%s__cfsql_crr\" SET\
        %s,\
        \"__cfsql_src\" = 0\
      WHERE %s;\
      \
      %s\
    END;\
    ",
      tableInfo->tblName,
      tableInfo->tblName,
      tableInfo->tblName,
      sets,
      pkWhereConditions,
      clockUpdate);
  rc = sqlite3_exec(db, zSql, 0, 0, err);

  sqlite3_free(zSql);
  sqlite3_free(sets);
  sqlite3_free(clockUpdate);

  if (tableInfo->pksLen != 0)
  {
    sqlite3_free(pkWhereConditions);
  }

  return rc;
}

char *cfsql_deleteTriggerQuery(cfsql_TableInfo *tableInfo)
{
  char *pkWhereConditions = 0;
  char *clockUpdate = 0;
  if (tableInfo->pksLen == 0)
  {
    pkWhereConditions = "\"rowid\" = NEW.\"rowid\"";
  }
  else
  {
    pkWhereConditions = cfsql_upTrigWhereConditions(tableInfo->pks, tableInfo->pksLen);
  }

  clockUpdate = cfsql_updateClocksStr(tableInfo, 1);
  char *zSql = sqlite3_mprintf(
      "CREATE TRIGGER \"%s__cfsql_dtrig\"\
    INSTEAD OF DELETE ON \"%s\"\
    BEGIN\
      UPDATE \"%s__cfsql_crr\" SET \"__cfsql_cl\" = \"__cfsql_cl\" + 1, \"__cfsql_src\" = 0 WHERE %s;\
      \
      %s\
    END",
      tableInfo->tblName,
      tableInfo->tblName,
      tableInfo->tblName,
      pkWhereConditions,
      clockUpdate);

  // TODO: test cases for pk and no pk and empty tables
  if (tableInfo->pksLen != 0) {
    sqlite3_free(pkWhereConditions);
  }
  sqlite3_free(clockUpdate);

  return zSql;
}

int cfsql_createDeleteTrigger(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err)
{
  int rc = SQLITE_OK;

  char *zSql = cfsql_deleteTriggerQuery(tableInfo);
  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);

  return rc;
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

char *cfsql_patchConflictSets(cfsql_ColumnInfo *cols, int len)
{
  char *mapped[len + 2]; //  + 2 for cl and update src

  for (int i = 0; i < len; ++i)
  {
    if (cols[i].versionOf == 0)
    {
      mapped[i] = sqlite3_mprintf(
          "\"%s\" = CASE\
          WHEN EXCLUDED.\"%s__cfsql_v\" > \"%s__cfsql_v\" THEN EXCLUCDED.\"%s\"\
          WHEN EXCLUDED.\"%s__cfsql_v\" = \"%s__cfsql_v\" THEN\
            CASE\
              WHEN EXCLUDED.\"%s\" > \"%s\" THEN EXCLUDED.\"%s\"\
              ELSE \"%s\"\
            END\
          ELSE \"%s\"\
        END",
          cols[i].name,
          cols[i].name,
          cols[i].name,
          cols[i].name,
          cols[i].name,
          cols[i].name,
          cols[i].name,
          cols[i].name,
          cols[i].name,
          cols[i].name,
          cols[i].name);
    }
    else
    {
      mapped[i] = sqlite3_mprintf(
          "\"%s\" = CASE\
          WHEN EXCLUDED.\"%s\" > \"%s\" THEN EXCLUDED.\"%s\"\
          ELSE \"%s\"\
        END",
          cols[i].name,
          cols[i].name,
          cols[i].name,
          cols[i].name,
          cols[i].name);
    }
  }

  mapped[len] = strdup("\"__cfsql_cl\" = CASE\
      WHEN EXCLUDED.\"__cfsql_cl\" > \"__cfsql_cl\" THEN EXCLUDED.\"__cfsql_cl\"\
      ELSE \"__cfsql_cl\"\
    END");
  mapped[len + 1] = strdup("__cfsql_src = 1");

  // join2 will free the mapped entries.
  // This is because `cfsql_identity` is a pass through (identity function)
  // and does not allocate a new string, causing the original string to be freed by join2.
  return cfsql_join2((char *(*)(const char *)) & cfsql_identity, mapped, len + 2, ",\n");
}

char *cfsql_patchClockUpdate(cfsql_TableInfo *tableInfo)
{
  char *pkList = 0;
  char *pkNewList = 0;

  if (tableInfo->pksLen == 0)
  {
    pkNewList = "NEW.\"rowid\"";
    pkList = "\"rowid\"";
  }
  else
  {
    pkNewList = cfsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, "NEW.");
    pkList = cfsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, 0);
  }

  char *zSql = sqlite3_mprintf(
      "INSERT INTO \"%s__cfsql_clock\" (\
      \"__cfsql_site_id\",\
      \"__cfsql_version\",\
      %s\
    ) SELECT \"key\" as \"__cfsql_site_id\", \"value\" as \"__cfsql_version\", %s\
      FROM\
    json_each(NEW.\"__cfsql_clock\") WHERE true\
    ON CONFLICT (\"__cfsql_ste_id\", %s) DO UPDATE SET\
      \"__cfsql_version\" = CASE WHEN EXCLUDED.\"__cfsql_version\" > \"__cfsql_version\" THEN EXCLUDED.\"__cfsql_version\" ELSE \"__cfsql_version\" END;",
      tableInfo->tblName,
      pkList,
      pkNewList,
      pkList);

  if (tableInfo->pksLen != 0) {
    sqlite3_free(pkList);
    sqlite3_free(pkNewList);
  }

  return zSql;
}

char *cfsql_patchTriggerQuery(cfsql_TableInfo *tableInfo)
{
  char *colList = cfsql_asIdentifierList(tableInfo->withVersionCols, tableInfo->withVersionColsLen, 0);
  char *newValuesList = cfsql_asIdentifierList(tableInfo->withVersionCols, tableInfo->withVersionColsLen, "NEW.");
  char *pkList = tableInfo->pksLen ? cfsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, 0) : "rowid";
  char *conflictSets = cfsql_patchConflictSets(tableInfo->withVersionCols, tableInfo->withVersionColsLen);
  // patch clock update is more involved than regular clock update queries
  char *clockUpdate = cfsql_patchClockUpdate(tableInfo);

  char *zSql = sqlite3_mprintf(
      "CREATE TRIGGER \"%s__cfsql_ptrig\"\
        INSTEAD OF INSERT ON \"%s__cfsql_patch\"\
      BEGIN\
        INSERT INTO \"%s__cfsql_crr\" (\
          %s, \"__cfsql_cl\", \"__cfsql_src\"\
        ) VALUES (\
          %s, NEW.\"__cfsql_cl\", 1\
        ) ON CONFLICT (%s) DO UPDATE SET\
        %s;\
      \
      %s\
      END;",
      tableInfo->tblName,
      tableInfo->tblName,
      tableInfo->tblName,
      colList,
      newValuesList,
      pkList,
      conflictSets,
      clockUpdate);

  sqlite3_free(colList);
  sqlite3_free(newValuesList);
  if (tableInfo->pksLen > 0) {
    sqlite3_free(pkList);
  }
  sqlite3_free(conflictSets);
  sqlite3_free(clockUpdate);

  return zSql;
}

int cfsql_createPatchTrigger(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err)
{
  char *zSql = cfsql_patchTriggerQuery(tableInfo);
  int rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);
  return rc;
}
