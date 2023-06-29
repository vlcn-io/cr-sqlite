#include "stmt-cache.h"

#include "uthash.h"
#include "util.h"

/**
 * Preparing statements is expensive. The crsql_changes virtual table uses a few
 * statements for each row selected or merged.
 *
 * We should not have to prepare these statements each time we use them.
 */

/**
 * @brief Frees the entry _after_ already being removed from the hash table.
 *
 * @param pEntry
 */
static void freeEntry(crsql_CachedStmt *pEntry) {
  sqlite3_free(pEntry->key);
  sqlite3_free(pEntry->value);
  sqlite3_free(pEntry);
}

/**
 * Pull a statement from the cache if one already exists for the given key.
 *
 * 1. Callers own the memory pointed to be zKey and zSql.
 * 2. Callers must not obtain two references to the same statement at the same
 * time.
 * 3. Callers are responsible for `resetting` the statement and unbinding values
 * when they are done with it.
 * 4. The statement must be reset before another call obtains a reference to it.
 * 5. Callers should not finalize the returned statements.
 *
 * No way is currently provided to evict cached statements so this cache should
 * only be used for bounded use cases.
 */
sqlite3_stmt *crsql_getOrPrepareCachedStmt(sqlite3 *pDb,
                                           crsql_ExtData *pExtData,
                                           const char *zKey, const char *zSql) {
  crsql_CachedStmt *pResult = NULL;
  int rc = SQLITE_OK;
  HASH_FIND_STR(pExtData->hStmts, zKey, pResult);

  if (pResult == NULL) {
    pResult = sqlite3_malloc(sizeof *pResult);
    pResult->key = crsql_strdup(zKey);

    rc = sqlite3_prepare_v3(pDb, zSql, -1, SQLITE_PREPARE_PERSISTENT,
                            &pResult->value, 0);
    if (rc != SQLITE_OK) {
      freeEntry(pResult);
      return NULL;
    }
    HASH_ADD_KEYPTR(hh, pExtData->hStmts, pResult->key, strlen(pResult->key),
                    pResult);
  }

  return pResult->value;
}

void crsql_clearStmtCache(sqlite3 *pDb, crsql_ExtData *pExtData) {
  crsql_CachedStmt *crsr, *tmp;

  HASH_ITER(hh, pExtData->hStmts, crsr, tmp) {
    HASH_DEL(pExtData->hStmts, crsr);
    freeEntry(crsr);
  }
}
