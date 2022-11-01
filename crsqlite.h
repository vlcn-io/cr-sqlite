#ifndef CRSQLITE_H
#define CRSQLITE_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include "tableinfo.h"
#include <stdint.h>
#include <stdatomic.h>

#ifndef UNIT_TEST
#define STATIC static
#else
#define STATIC
#endif

int crsql_createClockTable(
    sqlite3 *db,
    crsql_TableInfo *tableInfo,
    char **err);

typedef struct crsql_ExtData crsql_ExtData;
struct crsql_ExtData
{
  // this gets set at the start of each transaction on the first invocation
  // to crsql_nextdbversion()
  // and re-set on transaction commit or rollback.
  sqlite3_int64 dbVersion;
  unsigned char *siteId;
  int referenceCount;
};

#endif