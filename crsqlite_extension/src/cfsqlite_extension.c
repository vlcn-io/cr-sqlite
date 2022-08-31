/* Main file that loads the cfsqlite extension
  Lets try to keep it clean*/
#include <stdio.h>
#include <stdlib.h>

#include <sqlite3ext.h>

#include "vtab.h"
SQLITE_EXTENSION_INIT1



/* Function to initialize cfsqlite Extension, creates metatables if they dont exist */
int init_cfsqlite(sqlite3 *db)
{
  //TODO
  return SQLITE_OK;
}
#ifdef _WIN32
__declspec(dllexport)
#endif


int sqlite3_cfsqlite_init(
  sqlite3 *db,
  char **pzErrMsg,
  const sqlite3_api_routines *pApi
){
  int rc = SQLITE_OK;
  SQLITE_EXTENSION_INIT2(pApi);

  rc = init_cfsqlite(db);
  if (rc != SQLITE_OK){
    fprintf(stderr, "SQL error when initializing cfsqlite: %s\n", sqlite3_errmsg(db));
    return rc;
  }

  rc = init_cfsqlite_vtab(db, "cfsqlite", 0);
  if (rc != SQLITE_OK){
    fprintf(stderr, "SQL error when initializing cfsqlite: %s\n", sqlite3_errmsg(db));
    return rc;
  }

  fprintf(stderr, "cfsqlite initiated succesfully\n");
  return rc;
}
