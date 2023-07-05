#include "changes-vtab-write.h"

#include <string.h>

#include "changes-vtab-common.h"
#include "changes-vtab.h"
#include "consts.h"
#include "crsqlite.h"
#include "ext-data.h"
#include "stmt-cache.h"
#include "tableinfo.h"
#include "util.h"

/**
 *
 */
static int crsql_didCidWin(sqlite3 *db, crsql_ExtData *pExtData,
                           const unsigned char *localSiteId,
                           const char *insertTbl, const char *pkWhereList,
                           RawVec unpackedPks, const char *colName,
                           const sqlite3_value *insertVal,
                           sqlite3_int64 colVersion, char **errmsg) {
  char *zSql = 0;
  int rc = SQLITE_OK;

  // CACHED_STMT_GET_COL_VERSION
  char *zStmtCacheKey =
      crsql_getCacheKeyForStmtType(CACHED_STMT_GET_COL_VERSION, insertTbl, 0);
  if (zStmtCacheKey == 0) {
    *errmsg = sqlite3_mprintf(
        "Failed creating cache key for CACHED_STMT_GET_COL_VERSION");
    return -1;
  }
  sqlite3_stmt *pStmt = 0;
  pStmt = crsql_getCachedStmt(pExtData, zStmtCacheKey);
  if (pStmt == 0) {
    zSql = sqlite3_mprintf(
        "SELECT __crsql_col_version FROM \"%s__crsql_clock\" WHERE %s AND ? = "
        "__crsql_col_name",
        insertTbl, pkWhereList);

    rc = sqlite3_prepare_v3(db, zSql, -1, SQLITE_PREPARE_PERSISTENT, &pStmt, 0);
    sqlite3_free(zSql);

    if (rc != SQLITE_OK) {
      sqlite3_free(zStmtCacheKey);
      sqlite3_finalize(pStmt);
      *errmsg = sqlite3_mprintf(
          "Failed preparing stmt to select local column version");
      return -1;
    }
    crsql_setCachedStmt(pExtData, zStmtCacheKey, pStmt);
  } else {
    sqlite3_free(zStmtCacheKey);
    zStmtCacheKey = 0;
  }

  rc = crsql_bind_unpacked_values(pStmt, unpackedPks);
  rc +=
      sqlite3_bind_text(pStmt, unpackedPks.len + 1, colName, -1, SQLITE_STATIC);
  if (rc != SQLITE_OK) {
    crsql_resetCachedStmt(pStmt);
    *errmsg = sqlite3_mprintf(
        "Failed binding unpacked columns to select local column version");
    return -1;
  }

  rc = sqlite3_step(pStmt);
  if (rc == SQLITE_DONE) {
    crsql_resetCachedStmt(pStmt);
    // no rows returned
    // we of course win if there's nothing there.
    return 1;
  }

  if (rc != SQLITE_ROW) {
    crsql_resetCachedStmt(pStmt);
    *errmsg = sqlite3_mprintf(
        "Bad return code (%d) when selecting local column version", rc);
    return -1;
  }

  sqlite3_int64 localVersion = sqlite3_column_int64(pStmt, 0);
  crsql_resetCachedStmt(pStmt);

  if (colVersion > localVersion) {
    return 1;
  } else if (colVersion < localVersion) {
    return 0;
  }

  // else -- versions are equal
  // - pull curr value
  // - compare for tie break
  // CACHED_STMT_GET_CURR_VALUE
  zStmtCacheKey = crsql_getCacheKeyForStmtType(CACHED_STMT_GET_CURR_VALUE,
                                               insertTbl, colName);
  if (zStmtCacheKey == 0) {
    *errmsg = sqlite3_mprintf(
        "Failed creating cache key for CACHED_STMT_GET_CURR_VALUE");
    return -1;
  }
  pStmt = crsql_getCachedStmt(pExtData, zStmtCacheKey);
  if (pStmt == 0) {
    zSql = sqlite3_mprintf("SELECT \"%w\" FROM \"%w\" WHERE %s", colName,
                           insertTbl, pkWhereList);
    rc = sqlite3_prepare_v3(db, zSql, -1, SQLITE_PREPARE_PERSISTENT, &pStmt, 0);
    sqlite3_free(zSql);

    if (rc != SQLITE_OK) {
      sqlite3_free(zStmtCacheKey);
      sqlite3_finalize(pStmt);
      *errmsg = sqlite3_mprintf(
          "could not prepare statement to find row to merge with. %s",
          insertTbl);
      return -1;
    }
    crsql_setCachedStmt(pExtData, zStmtCacheKey, pStmt);
  } else {
    sqlite3_free(zStmtCacheKey);
  }

  rc = crsql_bind_unpacked_values(pStmt, unpackedPks);
  if (rc != SQLITE_OK) {
    crsql_resetCachedStmt(pStmt);
    *errmsg = sqlite3_mprintf(
        "Failed binding unpacked columns to select current val for tie break");
    return -1;
  }

  rc = sqlite3_step(pStmt);
  if (rc != SQLITE_ROW) {
    *errmsg = sqlite3_mprintf("could not find row to merge with for tbl %s",
                              insertTbl);
    crsql_resetCachedStmt(pStmt);
    return -1;
  }

  const sqlite3_value *localValue = sqlite3_column_value(pStmt, 0);
  int ret = crsql_compare_sqlite_values(insertVal, localValue);
  crsql_resetCachedStmt(pStmt);

  return ret > 0;
}

#define DELETED_LOCALLY -1
static int crsql_checkForLocalDelete(sqlite3 *db, crsql_ExtData *pExtData,
                                     const char *tblName, char *pkWhereList,
                                     RawVec unpackedPks) {
  int rc = SQLITE_OK;
  char *zStmtCacheKey = crsql_getCacheKeyForStmtType(
      CACHED_STMT_CHECK_FOR_LOCAL_DELETE, tblName, 0);
  if (zStmtCacheKey == 0) {
    return SQLITE_ERROR;
  }
  sqlite3_stmt *pStmt;
  pStmt = crsql_getCachedStmt(pExtData, zStmtCacheKey);
  if (pStmt == 0) {
    char *zSql = sqlite3_mprintf(
        "SELECT count(*) FROM \"%s__crsql_clock\" WHERE %s AND "
        "__crsql_col_name "
        "= %Q",
        tblName, pkWhereList, DELETE_CID_SENTINEL);

    rc = sqlite3_prepare_v3(db, zSql, -1, SQLITE_PREPARE_PERSISTENT, &pStmt, 0);
    sqlite3_free(zSql);

    if (rc != SQLITE_OK) {
      sqlite3_free(zStmtCacheKey);
      sqlite3_finalize(pStmt);
      return rc;
    }
    crsql_setCachedStmt(pExtData, zStmtCacheKey, pStmt);
  } else {
    sqlite3_free(zStmtCacheKey);
    zStmtCacheKey = 0;
  }

  rc = crsql_bind_unpacked_values(pStmt, unpackedPks);
  if (rc != SQLITE_OK) {
    crsql_resetCachedStmt(pStmt);
    crsql_free_unpacked_values(unpackedPks);
  }

  rc = sqlite3_step(pStmt);
  if (rc != SQLITE_ROW) {
    crsql_resetCachedStmt(pStmt);
    return SQLITE_ERROR;
  }

  int count = sqlite3_column_int(pStmt, 0);
  crsql_resetCachedStmt(pStmt);
  if (count == 1) {
    return DELETED_LOCALLY;
  }

  return SQLITE_OK;
}

static sqlite3_int64 crsql_setWinnerClock(
    sqlite3 *db, crsql_ExtData *pExtData, crsql_TableInfo *tblInfo,
    const char *pkIdentifierList, const char *pkBindList, RawVec unpackedPks,
    const char *insertColName, sqlite3_int64 insertColVrsn,
    sqlite3_int64 insertDbVrsn, const void *insertSiteId, int insertSiteIdLen) {
  int rc = SQLITE_OK;
  char *zStmtCacheKey = crsql_getCacheKeyForStmtType(
      CACHED_STMT_SET_WINNER_CLOCK, tblInfo->tblName, 0);
  if (zStmtCacheKey == 0) {
    return -1;
  }
  sqlite3_stmt *pStmt = 0;
  pStmt = crsql_getCachedStmt(pExtData, zStmtCacheKey);
  if (pStmt == 0) {
    char *zSql = sqlite3_mprintf(
        "INSERT OR REPLACE INTO \"%s__crsql_clock\" \
      (%s, \"__crsql_col_name\", \"__crsql_col_version\", \"__crsql_db_version\", \"__crsql_seq\", \"__crsql_site_id\")\
      VALUES (\
        %s,\
        ?,\
        ?,\
        MAX(crsql_nextdbversion(), ?),\
        crsql_increment_and_get_seq(),\
        ?\
      ) RETURNING _rowid_",
        tblInfo->tblName, pkIdentifierList, pkBindList);

    rc = sqlite3_prepare_v3(db, zSql, -1, SQLITE_PREPARE_PERSISTENT, &pStmt, 0);
    sqlite3_free(zSql);

    if (rc != SQLITE_OK) {
      sqlite3_free(zStmtCacheKey);
      sqlite3_finalize(pStmt);
      return -1;
    }
    crsql_setCachedStmt(pExtData, zStmtCacheKey, pStmt);
  } else {
    sqlite3_free(zStmtCacheKey);
    zStmtCacheKey = 0;
  }

  rc = crsql_bind_unpacked_values(pStmt, unpackedPks);
  rc += sqlite3_bind_text(pStmt, unpackedPks.len + 1, insertColName, -1,
                          SQLITE_STATIC);
  rc += sqlite3_bind_int64(pStmt, unpackedPks.len + 2, insertColVrsn);
  rc += sqlite3_bind_int64(pStmt, unpackedPks.len + 3, insertDbVrsn);
  if (insertSiteId == 0) {
    rc += sqlite3_bind_null(pStmt, unpackedPks.len + 4);
  } else {
    rc += sqlite3_bind_blob(pStmt, unpackedPks.len + 4, insertSiteId,
                            insertSiteIdLen, SQLITE_TRANSIENT);
  }

  if (rc == SQLITE_OK) {
    rc = sqlite3_step(pStmt);
  }

  if (rc == SQLITE_ROW) {
    sqlite3_int64 rowid = sqlite3_column_int64(pStmt, 0);
    crsql_resetCachedStmt(pStmt);
    return rowid;
  } else {
    crsql_resetCachedStmt(pStmt);
    return -1;
  }
}

static sqlite3_int64 crsql_mergePkOnlyInsert(
    sqlite3 *db, crsql_ExtData *pExtData, crsql_TableInfo *tblInfo,
    const char *pkBindingsList, RawVec unpackedPks, const char *pkIdentifiers,
    sqlite3_int64 remoteColVersion, sqlite3_int64 remoteDbVersion,
    const void *remoteSiteId, int remoteSiteIdLen) {
  int rc = SQLITE_OK;
  char *zStmtCacheKey = crsql_getCacheKeyForStmtType(
      CACHED_STMT_MERGE_PK_ONLY_INSERT, tblInfo->tblName, 0);
  if (zStmtCacheKey == 0) {
    return -1;
  }
  sqlite3_stmt *pStmt;
  pStmt = crsql_getCachedStmt(pExtData, zStmtCacheKey);
  if (pStmt == 0) {
    char *zSql =
        sqlite3_mprintf("INSERT OR IGNORE INTO \"%s\" (%s) VALUES (%s)",
                        tblInfo->tblName, pkIdentifiers, pkBindingsList);
    rc = sqlite3_prepare_v3(db, zSql, -1, SQLITE_PREPARE_PERSISTENT, &pStmt, 0);
    sqlite3_free(zSql);

    if (rc != SQLITE_OK) {
      sqlite3_free(zStmtCacheKey);
      sqlite3_finalize(pStmt);
      return rc;
    }
    crsql_setCachedStmt(pExtData, zStmtCacheKey, pStmt);
  } else {
    sqlite3_free(zStmtCacheKey);
    zStmtCacheKey = 0;
  }

  rc = crsql_bind_unpacked_values(pStmt, unpackedPks);
  if (rc == SQLITE_OK) {
    rc = sqlite3_exec(db, SET_SYNC_BIT, 0, 0, 0);
    if (rc == SQLITE_OK) {
      rc = sqlite3_step(pStmt);
      if (rc == SQLITE_DONE) {
        rc = SQLITE_OK;
      }
    }
  }
  crsql_resetCachedStmt(pStmt);

  sqlite3_exec(db, CLEAR_SYNC_BIT, 0, 0, 0);
  if (rc != SQLITE_OK) {
    return -1;
  }

  // TODO: if insert was ignored, no reason to change clock
  return crsql_setWinnerClock(db, pExtData, tblInfo, pkIdentifiers,
                              pkBindingsList, unpackedPks,
                              PKS_ONLY_CID_SENTINEL, remoteColVersion,
                              remoteDbVersion, remoteSiteId, remoteSiteIdLen);
}

static sqlite3_int64 crsql_mergeDelete(
    sqlite3 *db, crsql_ExtData *pExtData, crsql_TableInfo *tblInfo,
    const char *pkWhereList, RawVec unpackedPks, const char *pkBindList,
    const char *pkIdentifiers, sqlite3_int64 remoteColVersion,
    sqlite3_int64 remoteDbVersion, const void *remoteSiteId,
    int remoteSiteIdLen) {
  int rc = SQLITE_OK;
  char *zStmtCacheKey = crsql_getCacheKeyForStmtType(CACHED_STMT_MERGE_DELETE,
                                                     tblInfo->tblName, 0);
  if (zStmtCacheKey == 0) {
    return -1;
  }
  sqlite3_stmt *pStmt;
  pStmt = crsql_getCachedStmt(pExtData, zStmtCacheKey);
  if (pStmt == 0) {
    char *zSql = sqlite3_mprintf("DELETE FROM \"%w\" WHERE %s",
                                 tblInfo->tblName, pkWhereList);
    rc = sqlite3_prepare_v3(db, zSql, -1, SQLITE_PREPARE_PERSISTENT, &pStmt, 0);
    sqlite3_free(zSql);

    if (rc != SQLITE_OK) {
      sqlite3_free(zStmtCacheKey);
      sqlite3_finalize(pStmt);
      return rc;
    }
    crsql_setCachedStmt(pExtData, zStmtCacheKey, pStmt);
  } else {
    sqlite3_free(zStmtCacheKey);
    zStmtCacheKey = 0;
  }

  rc = crsql_bind_unpacked_values(pStmt, unpackedPks);
  if (rc == SQLITE_OK) {
    // TODO: perma prepare sync bit stmts
    rc = sqlite3_exec(db, SET_SYNC_BIT, 0, 0, 0);
    if (rc == SQLITE_OK) {
      rc = sqlite3_step(pStmt);
      if (rc == SQLITE_DONE) {
        rc = SQLITE_OK;
      }
    }
  }
  crsql_resetCachedStmt(pStmt);

  sqlite3_exec(db, CLEAR_SYNC_BIT, 0, 0, 0);
  if (rc != SQLITE_OK) {
    return -1;
  }

  return crsql_setWinnerClock(db, pExtData, tblInfo, pkIdentifiers, pkBindList,
                              unpackedPks, DELETE_CID_SENTINEL,
                              remoteColVersion, remoteDbVersion, remoteSiteId,
                              remoteSiteIdLen);
}

int crsql_mergeInsert(sqlite3_vtab *pVTab, int argc, sqlite3_value **argv,
                      sqlite3_int64 *pRowid, char **errmsg) {
  // he argv[1] parameter is the rowid of a new row to be inserted into the
  // virtual table. If argv[1] is an SQL NULL, then the implementation must
  // choose a rowid for the newly inserted row
  int rc = 0;
  crsql_Changes_vtab *pTab = (crsql_Changes_vtab *)pVTab;
  sqlite3 *db = pTab->db;
  char *zSql = 0;

  rc = crsql_ensureTableInfosAreUpToDate(db, pTab->pExtData, errmsg);

  if (rc != SQLITE_OK) {
    *errmsg = sqlite3_mprintf("Failed to update crr table information");
    return rc;
  }

  // column values exist in argv[2] and following.
  const int insertTblLen =
      sqlite3_value_bytes(argv[2 + CHANGES_SINCE_VTAB_TBL]);
  if (insertTblLen > MAX_TBL_NAME_LEN) {
    *errmsg = sqlite3_mprintf("crsql - table name exceeded max length");
    return SQLITE_ERROR;
  }
  // safe given we only use this if it exactly matches a table name
  // from tblInfo
  const unsigned char *insertTbl =
      sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_TBL]);
  sqlite3_value *insertPks = argv[2 + CHANGES_SINCE_VTAB_PK];

  int inesrtColNameLen = sqlite3_value_bytes(argv[2 + CHANGES_SINCE_VTAB_CID]);
  if (inesrtColNameLen > MAX_TBL_NAME_LEN) {
    *errmsg = sqlite3_mprintf("column name exceeded max length");
    return SQLITE_ERROR;
  }
  const char *insertColName =
      (const char *)sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_CID]);

  // `splitQuoteConcat` will validate these -- even tho 1 val should do
  // splitquoteconcat for the validation
  const sqlite3_value *insertVal = argv[2 + CHANGES_SINCE_VTAB_CVAL];
  sqlite3_int64 insertColVrsn =
      sqlite3_value_int64(argv[2 + CHANGES_SINCE_VTAB_COL_VRSN]);
  sqlite3_int64 insertDbVrsn =
      sqlite3_value_int64(argv[2 + CHANGES_SINCE_VTAB_DB_VRSN]);

  int insertSiteIdLen =
      sqlite3_value_bytes(argv[2 + CHANGES_SINCE_VTAB_SITE_ID]);
  if (insertSiteIdLen > SITE_ID_LEN) {
    *errmsg = sqlite3_mprintf("crsql - site id exceeded max length");
    return SQLITE_ERROR;
  }
  // safe given we only use siteid via `bind`
  const void *insertSiteId =
      sqlite3_value_blob(argv[2 + CHANGES_SINCE_VTAB_SITE_ID]);

  int tblInfoIndex = crsql_indexofTableInfo(pTab->pExtData->zpTableInfos,
                                            pTab->pExtData->tableInfosLen,
                                            (const char *)insertTbl);
  crsql_TableInfo *tblInfo;
  if (tblInfoIndex != -1) {
    tblInfo = pTab->pExtData->zpTableInfos[tblInfoIndex];
  } else {
    tblInfo = 0;
  }

  if (tblInfo == 0) {
    *errmsg = sqlite3_mprintf(
        "crsql - could not find the schema information for table %s",
        insertTbl);
    return SQLITE_ERROR;
  }

  int isDelete = strcmp(DELETE_CID_SENTINEL, insertColName) == 0;
  int isPkOnly = strcmp(PKS_ONLY_CID_SENTINEL, insertColName) == 0;

  char *pkWhereList = crsql_extractWhereList(tblInfo->pks, tblInfo->pksLen);
  if (pkWhereList == 0) {
    *errmsg = sqlite3_mprintf("crsql - failed creating where list for insert");
    return SQLITE_ERROR;
  }

  RawVec unpackedPks = crsql_unpack_columns(insertPks);
  if (unpackedPks.ptr == 0) {
    // if ptr is null, len is an error code.
    sqlite3_free(pkWhereList);
    return unpackedPks.len;
  }

  rc = crsql_checkForLocalDelete(db, pTab->pExtData, tblInfo->tblName,
                                 pkWhereList, unpackedPks);
  if (rc == DELETED_LOCALLY) {
    rc = SQLITE_OK;
    // delete wins. we're all done.
    sqlite3_free(pkWhereList);
    crsql_free_unpacked_values(unpackedPks);
    return rc;
  }

  // This happens if the state is a delete
  // We must `checkForLocalDelete` prior to merging a delete (happens above).
  // mergeDelete assumes we've already checked for a local delete.
  char *pkBindingList = crsql_bindingList(tblInfo->pksLen);
  if (pkBindingList == 0) {
    sqlite3_free(pkWhereList);
    crsql_free_unpacked_values(unpackedPks);
    *errmsg = sqlite3_mprintf("Failed sanitizing pk values");
    return SQLITE_ERROR;
  }

  char *pkIdentifierList =
      crsql_asIdentifierList(tblInfo->pks, tblInfo->pksLen, 0);
  if (isDelete) {
    sqlite3_int64 rowid =
        crsql_mergeDelete(db, pTab->pExtData, tblInfo, pkWhereList, unpackedPks,
                          pkBindingList, pkIdentifierList, insertColVrsn,
                          insertDbVrsn, insertSiteId, insertSiteIdLen);

    sqlite3_free(pkWhereList);
    crsql_free_unpacked_values(unpackedPks);
    sqlite3_free(pkBindingList);
    sqlite3_free(pkIdentifierList);
    if (rowid == -1) {
      *errmsg = sqlite3_mprintf("Failed inserting changeset");
      return SQLITE_ERROR;
    }
    *pRowid = crsql_slabRowid(tblInfoIndex, rowid);
    pTab->pExtData->rowsImpacted += 1;
    return SQLITE_OK;
  }

  if (isPkOnly ||
      !crsql_columnExists(insertColName, tblInfo->nonPks, tblInfo->nonPksLen)) {
    sqlite3_int64 rowid =
        crsql_mergePkOnlyInsert(db, pTab->pExtData, tblInfo, pkBindingList,
                                unpackedPks, pkIdentifierList, insertColVrsn,
                                insertDbVrsn, insertSiteId, insertSiteIdLen);
    sqlite3_free(pkWhereList);
    crsql_free_unpacked_values(unpackedPks);
    sqlite3_free(pkBindingList);
    sqlite3_free(pkIdentifierList);
    if (rowid == -1) {
      *errmsg = sqlite3_mprintf("Failed inserting changeset");
      return SQLITE_ERROR;
    }
    *pRowid = crsql_slabRowid(tblInfoIndex, rowid);
    pTab->pExtData->rowsImpacted += 1;
    return SQLITE_OK;
  }

  int doesCidWin = crsql_didCidWin(
      db, pTab->pExtData, pTab->pExtData->siteId, tblInfo->tblName, pkWhereList,
      unpackedPks, insertColName, insertVal, insertColVrsn, errmsg);
  sqlite3_free(pkWhereList);
  if (doesCidWin == -1 || doesCidWin == 0) {
    sqlite3_free(pkBindingList);
    sqlite3_free(pkIdentifierList);
    crsql_free_unpacked_values(unpackedPks);
    // doesCidWin == 0? compared against our clocks, nothing wins. OK and
    // Done.
    if (doesCidWin == -1 && *errmsg == 0) {
      *errmsg = sqlite3_mprintf("Failed computing cid win");
    }
    return doesCidWin == 0 ? SQLITE_OK : SQLITE_ERROR;
  }

  // CACHED_STMT_MERGE_INSERT
  zSql = sqlite3_mprintf(
      "INSERT INTO \"%w\" (%s, \"%w\")\
      VALUES (%s, ?)\
      ON CONFLICT DO UPDATE\
      SET \"%w\" = ?",
      tblInfo->tblName, pkIdentifierList, insertColName, pkBindingList,
      insertColName);

  rc = sqlite3_exec(db, SET_SYNC_BIT, 0, 0, errmsg);
  if (rc != SQLITE_OK) {
    sqlite3_free(pkBindingList);
    sqlite3_free(pkIdentifierList);
    crsql_free_unpacked_values(unpackedPks);
    sqlite3_exec(db, CLEAR_SYNC_BIT, 0, 0, 0);
    sqlite3_free(zSql);
    *errmsg = sqlite3_mprintf("Failed setting sync bit");
    return rc;
  }

  sqlite3_stmt *pStmt = 0;
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);
  if (rc == SQLITE_OK) {
    rc += crsql_bind_unpacked_values(pStmt, unpackedPks);
    rc = sqlite3_bind_value(pStmt, unpackedPks.len + 1, insertVal);
    rc += sqlite3_bind_value(pStmt, unpackedPks.len + 2, insertVal);
    if (rc == SQLITE_OK) {
      rc = sqlite3_step(pStmt);
      if (rc != SQLITE_DONE) {
        rc = SQLITE_ERROR;
      } else {
        rc = SQLITE_OK;
      }
    }
  }

  sqlite3_finalize(pStmt);
  sqlite3_exec(db, CLEAR_SYNC_BIT, 0, 0, 0);

  if (rc != SQLITE_OK) {
    sqlite3_free(pkBindingList);
    sqlite3_free(pkIdentifierList);
    crsql_free_unpacked_values(unpackedPks);
    *errmsg = sqlite3_mprintf("Failed inserting changeset");
    return rc;
  }

  sqlite3_int64 rowid = crsql_setWinnerClock(
      db, pTab->pExtData, tblInfo, pkIdentifierList, pkBindingList, unpackedPks,
      insertColName, insertColVrsn, insertDbVrsn, insertSiteId,
      insertSiteIdLen);
  sqlite3_free(pkIdentifierList);
  sqlite3_free(pkBindingList);
  crsql_free_unpacked_values(unpackedPks);

  if (rowid == -1) {
    *errmsg = sqlite3_mprintf("Failed updating winner clock");
    return SQLITE_ERROR;
  }

  *pRowid = crsql_slabRowid(tblInfoIndex, rowid);
  pTab->pExtData->rowsImpacted += 1;
  return rc;
}
