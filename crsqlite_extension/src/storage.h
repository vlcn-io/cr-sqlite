#ifndef AUGMENT_HEADER
#define AUGMENT_HEADER

#include <sqlite3ext.h>

int init_storage(
  sqlite3 *db,
  const char* ttbl,
  const char* createTableArgs,
  char **pzErr
);

#endif