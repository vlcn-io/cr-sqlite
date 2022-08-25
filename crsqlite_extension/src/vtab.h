#ifndef VTAB_HEADER
#define VTAB_HEADER

#include <sqlite3ext.h>

int init_crsqlite_vtab(
  sqlite3 *db,               /* SQLite connection to register module with */
  const char *zName,         /* Name of the module */
  void *pClientData          /* Client data for xCreate/xConnect */
);

#endif