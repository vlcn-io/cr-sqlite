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

typedef struct crsql_PerDbData crsql_PerDbData;
struct crsql_PerDbData
{
  /**
   * Cached representation of the version of the database.
   *
   * This is not an unsigned int since sqlite does not support unsigned ints
   * as a data type and we do eventually write db version(s) to the db.
   */
  _Atomic sqlite3_int64 dbVersion;
  unsigned char *siteId;
  int referenceCount;
};

#endif