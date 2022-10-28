#include "triggers.h"
#include "tableinfo.h"
#include "util.h"
#include "consts.h"

#include <stdint.h>
#include <string.h>
#include <stdio.h>

int crsql_createInsertTrigger(
    sqlite3 *db,
    crsql_TableInfo *tableInfo,
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
    pkList = crsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, 0);
    pkNewList = crsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, "NEW.");
  }

  // TODO: handle pk only tables
  // We need a CREATE_SENTINEL (-3?) to stand in for the create event so we can replicate PKs
  // If we have a create sentinel how will we insert the created rows without a requirement of nullability
  // on every column?
  // Keep some event data for create that represents the initial state of the row?
  // Future improvement.
  // TODO: bump once for the row rather than once per column
  // we'll need to make our vtab a without rowid table in that case.
  for (int i = 0; i < tableInfo->nonPksLen; ++i)
  {
    subTriggers[i] = sqlite3_mprintf(
        "INSERT OR REPLACE INTO \"%s__crsql_clock\" (\
        %s,\
        __crsql_col_num,\
        __crsql_version,\
        __crsql_site_id\
      ) SELECT \
        %s,\
        %d,\
        crsql_nextdbversion(),\
        0\
      WHERE crsql_internal_sync_bit() = 0;\n",
        tableInfo->tblName,
        pkList,
        pkNewList,
        tableInfo->nonPks[i].cid);
  }
  joinedSubTriggers = crsql_join(subTriggers, tableInfo->nonPksLen);

  for (int i = 0; i < tableInfo->nonPksLen; ++i)
  {
    sqlite3_free(subTriggers[i]);
  }

  zSql = sqlite3_mprintf("CREATE TRIGGER \"%s__crsql_itrig\"\
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

int crsql_createUpdateTrigger(sqlite3 *db,
                              crsql_TableInfo *tableInfo,
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
    pkList = crsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, 0);
    pkNewList = crsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, "NEW.");
  }

  for (int i = 0; i < tableInfo->nonPksLen; ++i)
  {
    // updates are conditionally inserted on the new value not being
    // the same as the old value.
    subTriggers[i] = sqlite3_mprintf("INSERT OR REPLACE INTO \"%s__crsql_clock\" (\
        %s,\
        __crsql_col_num,\
        __crsql_version,\
        __crsql_site_id\
      ) SELECT %s, %d, crsql_nextdbversion(), 0 WHERE crsql_internal_sync_bit() = 0 AND NEW.\"%s\" != OLD.\"%s\";\n",
                           tableInfo->tblName,
                           pkList,
                           pkNewList,
                           tableInfo->nonPks[i].cid,
                           tableInfo->nonPks[i].name,
                           tableInfo->nonPks[i].name);
  }
  joinedSubTriggers = crsql_join(subTriggers, tableInfo->nonPksLen);

  for (int i = 0; i < tableInfo->nonPksLen; ++i)
  {
    sqlite3_free(subTriggers[i]);
  }

  zSql = sqlite3_mprintf("CREATE TRIGGER \"%s__crsql_utrig\"\
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

char *crsql_deleteTriggerQuery(crsql_TableInfo *tableInfo)
{
  char *zSql;
  char *pkList = 0;
  char *pkOldList = 0;
  int rc = SQLITE_OK;

  if (tableInfo->pksLen == 0)
  {
    pkList = "\"rowid\"";
    pkOldList = "OLD.\"rowid\"";
  }
  else
  {
    pkList = crsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, 0);
    pkOldList = crsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, "OLD.");
  }

  zSql = sqlite3_mprintf(
      "CREATE TRIGGER \"%s__crsql_dtrig\"\
      AFTER DELETE ON \"%s\"\
    BEGIN\
      INSERT OR REPLACE INTO \"%s__crsql_clock\" (\
        %s,\
        __crsql_col_num,\
        __crsql_version,\
        __crsql_site_id\
      ) SELECT \
        %s,\
        %d,\
        crsql_nextdbversion(),\
        0\
      WHERE crsql_internal_sync_bit() = 0;\
    END;",
      tableInfo->tblName,
      tableInfo->tblName,
      tableInfo->tblName,
      pkList,
      pkOldList,
      DELETE_CID_SENTINEL);

  if (tableInfo->pksLen != 0)
  {
    sqlite3_free(pkList);
    sqlite3_free(pkOldList);
  }

  return zSql;
}

int crsql_createDeleteTrigger(
    sqlite3 *db,
    crsql_TableInfo *tableInfo,
    char **err)
{
  int rc = SQLITE_OK;

  char *zSql = crsql_deleteTriggerQuery(tableInfo);
  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);

  return rc;
}

int crsql_createCrrTriggers(
    sqlite3 *db,
    crsql_TableInfo *tableInfo,
    char **err)
{

  int rc = crsql_createInsertTrigger(db, tableInfo, err);
  if (rc == SQLITE_OK)
  {
    rc = crsql_createUpdateTrigger(db, tableInfo, err);
  }
  if (rc == SQLITE_OK)
  {
    rc = crsql_createDeleteTrigger(db, tableInfo, err);
  }

  return rc;
}
