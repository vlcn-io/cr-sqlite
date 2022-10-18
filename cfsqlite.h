#ifndef CFSQLITE_H
#define CFSQLITE_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include "tableinfo.h"

#ifndef UNIT_TEST
# define STATIC static
#else
# define STATIC
#endif

int cfsql_createClockTable(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err);

#endif