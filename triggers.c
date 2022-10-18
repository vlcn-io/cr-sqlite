#include "triggers.h"
#include "tableinfo.h"
#include "util.h"

#include <stdint.h>
#include <string.h>
#include <stdio.h>

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
        cfsql_dbversion(),\
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
  char *pkList = 0;
  char *pkNewList = 0;
  int rc = SQLITE_OK;

  if (tableInfo->pksLen == 0)
  {
    pkList = "\"rowid\"";
    pkNewList = "NEW.\"rowid\"";
  }
  else
  {
    pkList = cfsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, 0);
    pkNewList = cfsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, "NEW.");
  }

  // for each non pk column
  for (int i = 0; i < tableInfo->nonPksLen; ++i)
  {
    zSql = sqlite3_mprintf(
        "CREATE TRIGGER \"%s__cfsql_itrig\"\
      AFTER INSERT ON \"%s\"\
    BEGIN\
      INSERT OR REPLACE INTO \"%s__cfsql_clock\" (\
        %s,\
        __cfsql_col_num,\
        __cfsql_version,\
        __cfsqlite_site_id\
      ) VALUES (\
        %s,\
        %s,\
        cfsql_dbversion(),\
        0\
      );\
    END;",
        tableInfo->tblName,
        tableInfo->tblName,
        tableInfo->tblName,
        pkList,
        pkNewList,
        tableInfo->nonPks[i].cid);

    rc += sqlite3_exec(db, zSql, 0, 0, err);
    sqlite3_free(zSql);
  }

  if (tableInfo->pksLen != 0)
  {
    sqlite3_free(pkList);
    sqlite3_free(pkNewList);
  }

  return rc;
}

static char *mapPkWhereNew(const char *x)
{
  return sqlite3_mprintf("\"%s\" = NEW.\"%s\"", x, x);
}

static char *mapPkWhereOld(const char *x)
{
  return sqlite3_mprintf("\"%s\" = OLD.\"%s\"", x, x);
}

// TODO: we could generalize this and `conflictSetsStr` and and `updateTrigUpdateSet` and other places
// if we add a parameter which is a function that produces the strings
// to join.
char *cfsql_upTrigWhereConditions(cfsql_ColumnInfo *columnInfo, int len, int new)
{
  char *columnNames[len];
  for (int i = 0; i < len; ++i)
  {
    columnNames[i] = columnInfo[i].name;
  }

  return cfsql_join2(new == 1 ? &mapPkWhereNew : &mapPkWhereOld, columnNames, len, " AND ");
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
  char *pkList = 0;
  char *pkNewList = 0;
  int rc = SQLITE_OK;

  if (tableInfo->pksLen == 0)
  {
    pkList = "\"rowid\"";
    pkNewList = "NEW.\"rowid\"";
  }
  else
  {
    pkList = cfsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, 0);
    pkNewList = cfsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, "NEW.");
  }

  for (int i = 0; i < tableInfo->nonPksLen; ++i)
  {
    zSql = sqlite3_mprintf(
        "CREATE TRIGGER \"%s__cfsql_utrig\"\
      AFTER UPDATE ON \"%s\"\
    BEGIN\
      INSERT OR REPLACE INTO \"%s__cfsql_clock\" (\
        %s,\
        __cfsql_col_num,\
        __cfsql_version,\
        __cfsql_site_id\
      ) SELECT (%s, %s, cfsql_dbversion(), 0) WHERE NEW.\"%s\" != OLD.\"%s\";\
    END;\
    ",
        tableInfo->tblName,
        tableInfo->tblName,
        tableInfo->tblName,
        pkList,
        pkNewList,
        tableInfo->nonPks[i].cid,
        tableInfo->nonPks[i].name,
        tableInfo->nonPks[i].name);
    rc += sqlite3_exec(db, zSql, 0, 0, err);
    sqlite3_free(zSql);
  }

  if (tableInfo->pksLen != 0)
  {
    sqlite3_free(pkList);
    sqlite3_free(pkNewList);
  }

  return rc;
}

char *cfsql_deleteTriggerQuery(cfsql_TableInfo *tableInfo)
{
  char *pkWhereConditions = 0;
  char *clockUpdate = 0;
  if (tableInfo->pksLen == 0)
  {
    pkWhereConditions = "\"rowid\" = OLD.\"rowid\"";
  }
  else
  {
    pkWhereConditions = cfsql_upTrigWhereConditions(tableInfo->pks, tableInfo->pksLen, 0);
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
  if (tableInfo->pksLen != 0)
  {
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

int cfsql_createCrrTriggers(
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
