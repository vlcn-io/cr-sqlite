#ifndef CRSQLITE_TRIGGERS_H
#define CRSQLITE_TRIGGERS_H

#include "crsqlite.h"
#include <ctype.h>

int crsql_createCrrTriggers(
    sqlite3 *db,
    crsql_TableInfo *tableInfo,
    char **err);

int crsql_createInsertTrigger(
    sqlite3 *db,
    crsql_TableInfo *tableInfo,
    char **err);

int crsql_createUpdateTrigger(sqlite3 *db,
                              crsql_TableInfo *tableInfo,
                              char **err);

int crsql_createDeleteTrigger(sqlite3 *db, crsql_TableInfo *tableInfo, char **err);
char *crsql_deleteTriggerQuery(crsql_TableInfo *tableInfo);

char *crsql_insertTriggerQuery(crsql_TableInfo *tableInfo, char *pkList, char *pkNewList);
int crsql_removeCrrTriggersIfExist(
    sqlite3 *db,
    const char *tblName,
    char **err);

#endif
