#ifndef CRSQLITE_TRIGGERS_H
#define CRSQLITE_TRIGGERS_H

#include <ctype.h>

#include "crsqlite.h"

int crsql_createCrrTriggers(sqlite3 *db, crsql_TableInfo *tableInfo,
                            char **err);

int crsql_create_insert_trigger(sqlite3 *db, crsql_TableInfo *tableInfo,
                              char **err);

int crsql_create_update_trigger(sqlite3 *db, crsql_TableInfo *tableInfo,
                              char **err);

int crsql_createDeleteTrigger(sqlite3 *db, crsql_TableInfo *tableInfo,
                              char **err);
char *crsql_deleteTriggerQuery(crsql_TableInfo *tableInfo);

int crsql_remove_crr_triggers_if_exist(sqlite3 *db, const char *tblName);

#endif
