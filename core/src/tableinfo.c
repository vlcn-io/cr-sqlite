#include "tableinfo.h"

#include <assert.h>
#include <ctype.h>
#include <stdlib.h>
#include <string.h>

#include "consts.h"
#include "crsqlite.h"
#include "get-table.h"
#include "rust.h"
#include "util.h"

void crsql_freeAllTableInfos(crsql_TableInfo **tableInfos, int len) {
  for (int i = 0; i < len; ++i) {
    crsql_free_table_info(tableInfos[i]);
  }
  sqlite3_free(tableInfos);
}

crsql_TableInfo *crsql_findTableInfo(crsql_TableInfo **tblInfos, int len,
                                     const char *tblName) {
  for (int i = 0; i < len; ++i) {
    if (strcmp(tblInfos[i]->tblName, tblName) == 0) {
      return tblInfos[i];
    }
  }

  return 0;
}

int crsql_indexofTableInfo(crsql_TableInfo **tblInfos, int len,
                           const char *tblName) {
  for (int i = 0; i < len; ++i) {
    if (strcmp(tblInfos[i]->tblName, tblName) == 0) {
      return i;
    }
  }

  return -1;
}

sqlite3_int64 crsql_slabRowid(int idx, sqlite3_int64 rowid) {
  if (idx < 0) {
    return -1;
  }

  sqlite3_int64 modulo = rowid % ROWID_SLAB_SIZE;
  return idx * ROWID_SLAB_SIZE + modulo;
}

/**
 * Pulls all table infos for all crrs present in the database.
 * Run once at vtab initialization -- see docs on crsql_Changes_vtab
 * for the constraints this creates.
 */
int crsql_pullAllTableInfos(sqlite3 *db, crsql_TableInfo ***pzpTableInfos,
                            int *rTableInfosLen, char **errmsg) {
  char **zzClockTableNames = 0;
  int rNumCols = 0;
  int rNumRows = 0;
  int rc = SQLITE_OK;

  // Find all clock tables
  rc = crsql_get_table(db, CLOCK_TABLES_SELECT, &zzClockTableNames, &rNumRows,
                       &rNumCols, 0);

  if (rc != SQLITE_OK) {
    *errmsg = sqlite3_mprintf("crsql internal error discovering crr tables.");
    crsql_free_table(zzClockTableNames);
    return SQLITE_ERROR;
  }

  if (rNumRows == 0) {
    crsql_free_table(zzClockTableNames);
    return SQLITE_OK;
  }

  crsql_TableInfo **tableInfos =
      sqlite3_malloc(rNumRows * sizeof(crsql_TableInfo *));
  memset(tableInfos, 0, rNumRows * sizeof(crsql_TableInfo *));
  for (int i = 0; i < rNumRows; ++i) {
    // +1 since tableNames includes a row for column headers
    // Strip __crsql_clock suffix.
    char *baseTableName =
        crsql_strndup(zzClockTableNames[i + 1],
                      strlen(zzClockTableNames[i + 1]) - __CRSQL_CLOCK_LEN);
    rc = crsql_pull_table_info(db, baseTableName, &tableInfos[i], errmsg);
    sqlite3_free(baseTableName);

    if (rc != SQLITE_OK) {
      crsql_free_table(zzClockTableNames);
      crsql_freeAllTableInfos(tableInfos, rNumRows);
      return rc;
    }
  }

  crsql_free_table(zzClockTableNames);

  *pzpTableInfos = tableInfos;
  *rTableInfosLen = rNumRows;

  return SQLITE_OK;
}