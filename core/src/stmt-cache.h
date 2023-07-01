#ifndef CRSQLITE_STMT_CACHE_H
#define CRSQLITE_STMT_CACHE_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3
#include "ext-data.h"

sqlite3_stmt *crsql_getCachedStmt(crsql_ExtData *pExtData, const char *zKey);
void crsql_setCachedStmt(crsql_ExtData *pExtData, char *zKey,
                         sqlite3_stmt *pStmt);
void crsql_clearStmtCache(crsql_ExtData *pExtData);

#endif
