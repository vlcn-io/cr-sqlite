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

#endif
