#ifndef CRSQLITE_STMT_CACHE_H
#define CRSQLITE_STMT_CACHE_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3
#include "ext-data.h"

#define CACHED_STMT_SET_WINNER_CLOCK 0
#define CACHED_STMT_CHECK_FOR_LOCAL_DELETE 1
#define CACHED_STMT_GET_COL_VERSION 2
#define CACHED_STMT_GET_CURR_VALUE 3
#define CACHED_STMT_MERGE_PK_ONLY_INSERT 4
#define CACHED_STMT_MERGE_DELETE 5
#define CACHED_STMT_MERGE_INSERT 6
#define CACHED_STMT_ROW_PATCH_DATA 7

sqlite3_stmt *crsql_getCachedStmt(crsql_ExtData *pExtData, const char *zKey);
void crsql_setCachedStmt(crsql_ExtData *pExtData, char *zKey,
                         sqlite3_stmt *pStmt);
void crsql_clearStmtCache(crsql_ExtData *pExtData);
int crsql_resetCachedStmt(sqlite3_stmt *pStmt);
#endif
