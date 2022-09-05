#ifndef VTAB_HEADER
#define VTAB_HEADER

#include <sqlite3ext.h>

#define COLUMN_NAME 1
#define COLUMN_TYPE 2
#define COLUMN_NOT_NULL 3
#define COLUMN_DFLT_VAL 4
#define COLUMN_PK 5

int init_cfsqlite_vtab(
  sqlite3 *db,               /* SQLite connection to register module with */
  const char *zName,         /* Name of the module */
  void *pClientData          /* Client data for xCreate/xConnect */
);

#endif