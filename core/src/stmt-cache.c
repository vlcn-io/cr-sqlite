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

// Winner clock key is simply the table name itself as column is an argument in
// this case.
#define CACHED_STMT_SET_WINNER_CLOCK 0
#define CACHED_STMT_CHECK_FOR_LOCAL_DELETE 1
#define CACHED_STMT_GET_COL_VERSION 2
#define CACHED_STMT_GET_CURR_VALUE 3
#define CACHED_STMT_MERGE_PK_ONLY_INSERT 4
#define CACHED_STMT_MERGE_DELETE 5
#define CACHED_STMT_MERGE_INSERT 6

/**
 * Winner clock key is simply the table name itself.
 */
char *crsql_setWinnerClockKey(const char *tblName) {
  // tbl_name + _ + type ?
}

char *crsql_checkForLocalDeleteKey(const char *tblName) {}

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
  crsql_CachedStmt *crsr, *tmp;

  HASH_ITER(hh, pExtData->hStmts, crsr, tmp) {
    HASH_DEL(pExtData->hStmts, crsr);
    freeEntry(crsr);
  }
}
