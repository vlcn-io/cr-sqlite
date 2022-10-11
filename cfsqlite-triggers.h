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

int cfsql_createUpdateTrigger(sqlite3 *db,
                              cfsql_TableInfo *tableInfo,
                              char **err);

char *cfsql_upTrigWhereConditions(cfsql_ColumnInfo *columnInfo, int len);
char *cfsql_upTrigSets(cfsql_ColumnInfo *columnInfo, int len);
int cfsql_createDeleteTrigger(sqlite3 *db, cfsql_TableInfo *tableInfo, char **err);
char *cfsql_deleteTriggerQuery(cfsql_TableInfo *tableInfo);
char *cfsql_conflictSetsStr(cfsql_ColumnInfo *cols, int len);

#endif
