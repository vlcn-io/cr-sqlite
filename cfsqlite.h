#ifndef CFSQLITE_H
#define CFSQLITE_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include "tableinfo.h"
#include "queryinfo.h"

#ifndef UNIT_TEST
# define STATIC static
#else
# define STATIC
#endif

int cfsql_createClockTable(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err);
int cfsql_createCrrBaseTable(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err);
char *cfsql_getCreateCrrIndexQuery(
  cfsql_QueryInfo *query
);

#endif