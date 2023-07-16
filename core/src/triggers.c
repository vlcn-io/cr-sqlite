#include "triggers.h"

#include <stdint.h>
#include <string.h>

#include "consts.h"
#include "tableinfo.h"
#include "util.h"

static char *compareWithOld(const char *in) {
  return sqlite3_mprintf("\"%w\" = OLD.\"%w\"", in, in);
}

char *crsql_deleteTriggerQuery(crsql_TableInfo *tableInfo) {
  char *zSql;
  char *pkList = 0;
  char *pkOldList = 0;

  pkList = crsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, 0);
  pkOldList = crsql_asIdentifierList(tableInfo->pks, tableInfo->pksLen, "OLD.");

  char **pkNames = sqlite3_malloc(tableInfo->pksLen * sizeof(char *));
  for (int i = 0; i < tableInfo->pksLen; ++i) {
    pkNames[i] = tableInfo->pks[i].name;
  }
  char *pkWhereList =
      crsql_join2(&compareWithOld, pkNames, tableInfo->pksLen, " AND ");

  zSql = sqlite3_mprintf(
      "CREATE TRIGGER IF NOT EXISTS \"%w__crsql_dtrig\"\
      AFTER DELETE ON \"%w\"\
    BEGIN\
      INSERT INTO \"%w__crsql_clock\" (\
        %s,\
        __crsql_col_name,\
        __crsql_col_version,\
        __crsql_db_version,\
        __crsql_seq,\
        __crsql_site_id\
      ) SELECT \
        %s,\
        %Q,\
        1,\
        crsql_nextdbversion(),\
        crsql_increment_and_get_seq(),\
        NULL\
      WHERE crsql_internal_sync_bit() = 0 ON CONFLICT DO UPDATE SET\
      __crsql_col_version = __crsql_col_version + 1,\
      __crsql_db_version = crsql_nextdbversion(),\
      __crsql_seq = crsql_get_seq() - 1,\
      __crsql_site_id = NULL;\
      \
      DELETE FROM \"%w__crsql_clock\" WHERE crsql_internal_sync_bit() = 0 AND %s AND __crsql_col_name != '__crsql_del';\
      END; ",
      tableInfo->tblName, tableInfo->tblName, tableInfo->tblName, pkList,
      pkOldList, DELETE_CID_SENTINEL, tableInfo->tblName, pkWhereList);

  sqlite3_free(pkList);
  sqlite3_free(pkOldList);
  sqlite3_free(pkWhereList);
  sqlite3_free(pkNames);

  return zSql;
}

int crsql_createDeleteTrigger(sqlite3 *db, crsql_TableInfo *tableInfo,
                              char **err) {
  int rc = SQLITE_OK;

  char *zSql = crsql_deleteTriggerQuery(tableInfo);
  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);

  return rc;
}

int crsql_createCrrTriggers(sqlite3 *db, crsql_TableInfo *tableInfo,
                            char **err) {
  int rc = crsql_create_insert_trigger(db, tableInfo, err);
  if (rc == SQLITE_OK) {
    rc = crsql_create_update_trigger(db, tableInfo, err);
  }
  if (rc == SQLITE_OK) {
    rc = crsql_createDeleteTrigger(db, tableInfo, err);
  }

  return rc;
}
