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
