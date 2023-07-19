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
int crsql_did_cid_win(sqlite3 *db, crsql_ExtData *pExtData,
                      const char *insertTbl, const char *pkWhereList,
                      RawVec unpackedPks, const char *colName,
                      sqlite3_value *insertVal, sqlite3_int64 colVersion,
                      char **errmsg);

#define DELETED_LOCALLY -1
int crsql_check_for_local_delete(sqlite3 *db, crsql_ExtData *pExtData,
                                 const char *tblName, char *pkWhereList,
                                 RawVec unpackedPks);

sqlite3_int64 crsql_set_winner_clock(
    sqlite3 *db, crsql_ExtData *pExtData, crsql_TableInfo *tblInfo,
    const char *pkIdentifierList, const char *pkBindList, RawVec unpackedPks,
    const char *insertColName, sqlite3_int64 insertColVrsn,
    sqlite3_int64 insertDbVrsn, const void *insertSiteId, int insertSiteIdLen);

sqlite3_int64 crsql_merge_pk_only_insert(
    sqlite3 *db, crsql_ExtData *pExtData, crsql_TableInfo *tblInfo,
    const char *pkBindingsList, RawVec unpackedPks, const char *pkIdentifiers,
    sqlite3_int64 remoteColVersion, sqlite3_int64 remoteDbVersion,
    const void *remoteSiteId, int remoteSiteIdLen);

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
    rc = sqlite3_step(pExtData->pSetSyncBitStmt);
    if (rc == SQLITE_ROW) {
      rc = SQLITE_OK;
    }
    rc += sqlite3_reset(pExtData->pSetSyncBitStmt);
    if (rc == SQLITE_OK) {
      rc = sqlite3_step(pStmt);
      if (rc == SQLITE_DONE) {
        rc = SQLITE_OK;
      }
    }
  }
  crsql_resetCachedStmt(pStmt);

  int syncrc = sqlite3_step(pExtData->pClearSyncBitStmt);
  if (syncrc == SQLITE_ROW) {
    syncrc = SQLITE_OK;
  }
  syncrc += sqlite3_reset(pExtData->pClearSyncBitStmt);
  if (rc != SQLITE_OK || syncrc != SQLITE_OK) {
    return -1;
  }

  return crsql_set_winner_clock(db, pExtData, tblInfo, pkIdentifiers,
                                pkBindList, unpackedPks, DELETE_CID_SENTINEL,
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
  sqlite3_value *insertVal = argv[2 + CHANGES_SINCE_VTAB_CVAL];
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

  rc = crsql_check_for_local_delete(db, pTab->pExtData, tblInfo->tblName,
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
        crsql_merge_pk_only_insert(db, pTab->pExtData, tblInfo, pkBindingList,
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

  int doesCidWin = crsql_did_cid_win(db, pTab->pExtData, tblInfo->tblName,
                                     pkWhereList, unpackedPks, insertColName,
                                     insertVal, insertColVrsn, errmsg);
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

  char *zStmtCacheKey = crsql_getCacheKeyForStmtType(
      CACHED_STMT_MERGE_INSERT, tblInfo->tblName, insertColName);
  sqlite3_stmt *pStmt = 0;
  if (zStmtCacheKey == 0) {
    *errmsg = sqlite3_mprintf(
        "Failed creating cache key for CACHED_STMT_MERGE_INSERT");
    return SQLITE_ERROR;
  }
  pStmt = crsql_getCachedStmt(pTab->pExtData, zStmtCacheKey);
  if (pStmt == 0) {
    zSql = sqlite3_mprintf(
        "INSERT INTO \"%w\" (%s, \"%w\")\
      VALUES (%s, ?)\
      ON CONFLICT DO UPDATE\
      SET \"%w\" = ?",
        tblInfo->tblName, pkIdentifierList, insertColName, pkBindingList,
        insertColName);
    rc = sqlite3_prepare_v3(db, zSql, -1, SQLITE_PREPARE_PERSISTENT, &pStmt, 0);
    sqlite3_free(zSql);

    if (rc != SQLITE_OK) {
      sqlite3_free(zStmtCacheKey);
      sqlite3_finalize(pStmt);
      *errmsg = sqlite3_mprintf("Failed preparing CACHED_STMT_MERGE_INSERT");
      return rc;
    }
    crsql_setCachedStmt(pTab->pExtData, zStmtCacheKey, pStmt);
  } else {
    sqlite3_free(zStmtCacheKey);
    zStmtCacheKey = 0;
  }

  rc += crsql_bind_unpacked_values(pStmt, unpackedPks);
  rc += sqlite3_bind_value(pStmt, unpackedPks.len + 1, insertVal);
  rc += sqlite3_bind_value(pStmt, unpackedPks.len + 2, insertVal);
  if (rc == SQLITE_OK) {
    rc = sqlite3_step(pTab->pExtData->pSetSyncBitStmt);
    if (rc == SQLITE_ROW) {
      rc = SQLITE_OK;
    }
    rc += sqlite3_reset(pTab->pExtData->pSetSyncBitStmt);
    if (rc == SQLITE_OK) {
      rc = sqlite3_step(pStmt);
      if (rc != SQLITE_DONE) {
        rc = SQLITE_ERROR;
      } else {
        rc = SQLITE_OK;
      }
    }
  }

  crsql_resetCachedStmt(pStmt);
  int syncrc = sqlite3_step(pTab->pExtData->pClearSyncBitStmt);
  if (syncrc == SQLITE_ROW) {
    syncrc = SQLITE_OK;
  }
  syncrc += sqlite3_reset(pTab->pExtData->pClearSyncBitStmt);

  if (rc != SQLITE_OK || syncrc != SQLITE_OK) {
    sqlite3_free(pkBindingList);
    sqlite3_free(pkIdentifierList);
    crsql_free_unpacked_values(unpackedPks);
    *errmsg = sqlite3_mprintf("Failed inserting changeset");
    return rc;
  }

  sqlite3_int64 rowid = crsql_set_winner_clock(
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
