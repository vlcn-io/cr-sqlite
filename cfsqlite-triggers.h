#ifndef CFSQLITE_TRIGGERS
#define CFSQLITE_TRIGGERS

#include "cfsqlite.h"
#include <ctype.h>

int cfsql_createCrrViewTriggers(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err);

int cfsql_createPatchTrigger(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err);

int cfsql_createInsertTrigger(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err);
  
char *cfsql_upTrigwhereConditions(cfsql_ColumnInfo *columnInfo, int len);

#endif
