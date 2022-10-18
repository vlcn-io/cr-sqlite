#include "triggers.h"
#include "tableinfo.h"
#include "util.h"
#include "consts.h"

#include <stdint.h>
#include <string.h>
#include <stdio.h>

int cfsql_createInsertTrigger(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err)
{
  char *zSql;
  char *pkList = 0;
  char *pkNewList = 0;
  int rc = SQLITE_OK;
  char *subTriggers[tableInfo->nonPksLen];
  char *joinedSubTriggers;

  // TODO: we should track a sentinel create for this case
  if (tableInfo->nonPksLen == 0)
  {
    return rc;
  }

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
    subTriggers[i] = sqlite3_mprintf(
        "INSERT OR REPLACE INTO \"%s__cfsql_clock\" (\
        %s,\
        __cfsql_col_num,\
        __cfsql_version,\
        __cfsql_site_id\
      ) VALUES (\
        %s,\
        %d,\
        cfsql_dbversion(),\
        0\
      );\n",
        tableInfo->tblName,
        pkList,
        pkNewList,
        tableInfo->nonPks[i].cid);
  }
  joinedSubTriggers = cfsql_join(subTriggers, tableInfo->nonPksLen);

  for (int i = 0; i < tableInfo->nonPksLen; ++i)
  {
    sqlite3_free(subTriggers[i]);
  }

  zSql = sqlite3_mprintf("CREATE TRIGGER \"%s__cfsql_itrig\"\
      AFTER INSERT ON \"%s\"\
    BEGIN\
      %s\
    END;",
                         tableInfo->tblName,
                         tableInfo->tblName,
                         joinedSubTriggers);

  sqlite3_free(joinedSubTriggers);

  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);

  if (tableInfo->pksLen != 0)
  {
    sqlite3_free(pkList);
    sqlite3_free(pkNewList);
  }

  return rc;
}

int cfsql_createUpdateTrigger(sqlite3 *db,
                              cfsql_TableInfo *tableInfo,
                              char **err)
{
  char *zSql;
  char *pkList = 0;
  char *pkNewList = 0;
  int rc = SQLITE_OK;
  char *subTriggers[tableInfo->nonPksLen];
  char *joinedSubTriggers;

  if (tableInfo->nonPksLen == 0)
  {
    return rc;
  }

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
    subTriggers[i] = sqlite3_mprintf("INSERT OR REPLACE INTO \"%s__cfsql_clock\" (\
        %s,\
        __cfsql_col_num,\
        __cfsql_version,\
        __cfsql_site_id\
      ) SELECT %s, %d, cfsql_dbversion(), 0 WHERE NEW.\"%s\" != OLD.\"%s\";\n",
                           tableInfo->tblName,
                           pkList,
                           pkNewList,
                           tableInfo->nonPks[i].cid,
                           tableInfo->nonPks[i].name,
                           tableInfo->nonPks[i].name);
  }
  joinedSubTriggers = cfsql_join(subTriggers, tableInfo->nonPksLen);

  for (int i = 0; i < tableInfo->nonPksLen; ++i)
  {
    sqlite3_free(subTriggers[i]);
  }

  zSql = sqlite3_mprintf("CREATE TRIGGER \"%s__cfsql_utrig\"\
      AFTER UPDATE ON \"%s\"\
    BEGIN\
      %s\
    END;",
                  tableInfo->tblName,
                  tableInfo->tblName,
                  joinedSubTriggers);

  sqlite3_free(joinedSubTriggers);

  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);

  if (tableInfo->pksLen != 0)
  {
    sqlite3_free(pkList);
    sqlite3_free(pkNewList);
  }

  return rc;
}

char *cfsql_deleteTriggerQuery(cfsql_TableInfo *tableInfo)
{
  char *zSql;
  char *pkList = 0;
  char *pkNewList = 0;
  int rc = SQLITE_OK;

  if (tableInfo->pksLen == 0)
  {
    pkList = "\"rowid\"";
    pkNewList = "OLD.\"rowid\"";
  }
  else
  {
    pkList = cfsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, 0);
    pkNewList = cfsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, "OLD.");
  }

  zSql = sqlite3_mprintf(
      "CREATE TRIGGER \"%s__cfsql_dtrig\"\
      AFTER DELETE ON \"%s\"\
    BEGIN\
      INSERT OR REPLACE INTO \"%s__cfsql_clock\" (\
        %s,\
        __cfsql_col_num,\
        __cfsql_version,\
        __cfsql_site_id\
      ) VALUES (\
        %s,\
        %d,\
        cfsql_dbversion(),\
        0\
      );\
    END;",
      tableInfo->tblName,
      tableInfo->tblName,
      tableInfo->tblName,
      pkList,
      pkNewList,
      DELETE_CLOCK_SENTINEL);

  if (tableInfo->pksLen != 0)
  {
    sqlite3_free(pkList);
    sqlite3_free(pkNewList);
  }

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
