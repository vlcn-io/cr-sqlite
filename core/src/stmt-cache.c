#include "stmt-cache.h"

#include "ext-data.h"
#include "uthash.h"
#include "util.h"

/**
 * Preparing statements is expensive. The crsql_changes virtual table uses a few
 * statements for each row selected or merged.
 *
 * We should not have to prepare these statements each time we use them.
 */

/**
 * @brief Frees the entry _after_ being removed from the hash table.
 *
 * @param pEntry
 */
static void freeEntry(crsql_CachedStmt *pEntry) {
  sqlite3_free(pEntry->key);
  sqlite3_finalize(pEntry->value);
  sqlite3_free(pEntry);
}

char *crsql_getCacheKeyForStmtType(int stmtType, const char *zTblName,
                                   const char *mzColName) {
  char *zRet;
  int len;
  int tblNameLen;
  int colNameLen;
  switch (stmtType) {
    case CACHED_STMT_SET_WINNER_CLOCK:
    case CACHED_STMT_CHECK_FOR_LOCAL_DELETE:
    case CACHED_STMT_GET_COL_VERSION:
    case CACHED_STMT_MERGE_PK_ONLY_INSERT:
    case CACHED_STMT_MERGE_DELETE:
      if (mzColName != 0) {
        return 0;
      }
      // type + _ + strlen(tbl) + nullterm
      tblNameLen = strlen(zTblName);
      len = 2 + tblNameLen + 1;
      zRet = sqlite3_malloc(len * sizeof(char *));
      zRet[len - 1] = '\0';
      zRet[0] = 48 + stmtType;
      zRet[1] = '_';
      memcpy(zRet + 2, zTblName, tblNameLen);
      return zRet;
    case CACHED_STMT_GET_CURR_VALUE:
    case CACHED_STMT_MERGE_INSERT:
    case CACHED_STMT_ROW_PATCH_DATA:
      if (mzColName == 0) {
        return 0;
      }
      tblNameLen = strlen(zTblName);
      colNameLen = strlen(mzColName);
      // type + _ + tblNameLen + _ + colNameLen + nullterm
      len = 2 + tblNameLen + 1 + colNameLen + 1;
      zRet = sqlite3_malloc(len * sizeof(char *));
      zRet[len - 1] = '\0';
      zRet[0] = 48 + stmtType;
      zRet[1] = '_';
      memcpy(zRet + 2, zTblName, tblNameLen);
      zRet[tblNameLen + 2] = '_';
      memcpy(zRet + 2 + tblNameLen + 1, mzColName, colNameLen);
      return zRet;
  }

  return 0;
}

int crsql_resetCachedStmt(sqlite3_stmt *pStmt) {
  if (pStmt == 0) {
    return SQLITE_OK;
  }
  int rc = sqlite3_clear_bindings(pStmt);
  rc += sqlite3_reset(pStmt);
  return rc;
}

/**
 * @brief Look up a cache entry. Caller retains ownership of the key.
 */
sqlite3_stmt *crsql_getCachedStmt(crsql_ExtData *pExtData, const char *zKey) {
  crsql_CachedStmt *pResult = NULL;
  HASH_FIND_STR(pExtData->hStmts, zKey, pResult);
  if (pResult == NULL) {
    return NULL;
  }
  return pResult->value;
}

/**
 * @brief Set a cache entry. Ownership of key and stmt are transferred to the
 * cache.
 */
void crsql_setCachedStmt(crsql_ExtData *pExtData, char *zKey,
                         sqlite3_stmt *pStmt) {
  crsql_CachedStmt *pEntry = NULL;
  pEntry = sqlite3_malloc(sizeof *pEntry);
  pEntry->key = zKey;
  pEntry->value = pStmt;
  HASH_ADD_KEYPTR(hh, pExtData->hStmts, pEntry->key, strlen(pEntry->key),
                  pEntry);
}

void crsql_clearStmtCache(crsql_ExtData *pExtData) {
  if (pExtData->hStmts == 0) {
    return;
  }
  crsql_CachedStmt *crsr, *tmp;

  HASH_ITER(hh, pExtData->hStmts, crsr, tmp) {
    HASH_DEL(pExtData->hStmts, crsr);
    freeEntry(crsr);
  }
  HASH_CLEAR(hh, pExtData->hStmts);
}
