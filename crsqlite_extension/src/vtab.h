#ifndef VTAB_HEADER
#define VTAB_HEADER

#include <sqlite3ext.h>

int initCrsqliteVtab(
  sqlite3 *db,               /* SQLite connection to register module with */
  const char *zName,         /* Name of the module */
  void *pClientData          /* Client data for xCreate/xConnect */
);

#endif