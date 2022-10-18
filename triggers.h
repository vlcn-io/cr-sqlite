#ifndef CFSQLITE_TRIGGERS_H
#define CFSQLITE_TRIGGERS_H

#include "cfsqlite.h"
#include <ctype.h>

int cfsql_createCrrTriggers(
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

int cfsql_createUpdateTrigger(sqlite3 *db,
                              cfsql_TableInfo *tableInfo,
                              char **err);

char *cfsql_upTrigWhereConditions(cfsql_ColumnInfo *columnInfo, int len, int new);
char *cfsql_upTrigSets(cfsql_ColumnInfo *columnInfo, int len);
int cfsql_createDeleteTrigger(sqlite3 *db, cfsql_TableInfo *tableInfo, char **err);
char *cfsql_deleteTriggerQuery(cfsql_TableInfo *tableInfo);

#endif
