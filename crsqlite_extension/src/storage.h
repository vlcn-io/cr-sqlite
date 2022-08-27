#ifndef AUGMENT_HEADER
#define AUGMENT_HEADER

#include <sqlite3ext.h>

int get_column_names(
  sqlite3 *db, 
  const char *zTab,
  char ***paCol, 
  int *pnCol
);


int get_index_array(
  sqlite3 *db,             /* Database connection */
  const char *zTab,        /* Name of table in database db */
  int nCol,
  int **paIndex
);


int init_storage(
  sqlite3 *db,
  int argc, const char *const*argv,
  char **pzErr
);

#endif