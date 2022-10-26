#ifndef CRSQLITE_H
#define CRSQLITE_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include "tableinfo.h"
#include <stdint.h>
#include <stdatomic.h>

#ifndef UNIT_TEST
# define STATIC static
#else
# define STATIC
#endif

int crsql_createClockTable(
    sqlite3 *db,
    crsql_TableInfo *tableInfo,
    char **err);

extern unsigned char crsql_siteIdBlob[];
extern const size_t crsql_siteIdBlobSize;
extern _Atomic int64_t crsql_dbVersion;

#endif