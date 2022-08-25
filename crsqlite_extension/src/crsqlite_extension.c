/* Main file that loads the crsqlite extension
  Lets try to keep it clean*/
#include <stdio.h>
#include <stdlib.h>

#include <sqlite3ext.h>

#include "vtab.h"
SQLITE_EXTENSION_INIT1



/* Function to initialize crsqlite Extension, creates metatables if they dont exist */
int init_crsqlite(sqlite3 *db)
{
  //TODO
  return SQLITE_OK;
}
#ifdef _WIN32
__declspec(dllexport)
#endif


int sqlite3_crsqlite_init(
  sqlite3 *db,
  char **pzErrMsg,
  const sqlite3_api_routines *pApi
){
  int rc = SQLITE_OK;
  SQLITE_EXTENSION_INIT2(pApi);

  rc = init_crsqlite(db);
  if (rc != SQLITE_OK){
    fprintf(stderr, "SQL error when initializing crsqlite: %s\n", sqlite3_errmsg(db));
    return rc;
  }

  rc = init_crsqlite_vtab(db, "crsqlite", 0);
  if (rc != SQLITE_OK){
    fprintf(stderr, "SQL error when initializing crsqlite: %s\n", sqlite3_errmsg(db));
    return rc;
  }

  fprintf(stderr, "crsqlite initiated succesfully\n");
  return rc;
}
