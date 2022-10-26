#ifndef CRSQLITE_H
#define CRSQLITE_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include "tableinfo.h"

#ifndef UNIT_TEST
# define STATIC static
#else
# define STATIC
#endif

int crsql_createClockTable(
    sqlite3 *db,
    crsql_TableInfo *tableInfo,
    char **err);

unsigned char crsql_siteIdBlob[16];
const size_t crsql_siteIdBlobSize;

#endif