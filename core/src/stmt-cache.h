#ifndef CRSQLITE_STMT_CACHE_H
#define CRSQLITE_STMT_CACHE_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3
#include "ext-data.h"

sqlite3_stmt *crsql_getOrPrepareCachedStmt(sqlite3 *pDb,
                                           crsql_ExtData *pExtData,
                                           const char *zKey, const char *zSql);

void crsql_clearStmtCache(sqlite3 *pDb, crsql_ExtData *pExtData);

#endif
