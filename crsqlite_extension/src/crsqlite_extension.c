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

/* TODO:
    --  Add augmentation function(s)
    --  Add Generate changeset
    --  Add other stuff
*/
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

  /* Insert here calls to
  **     sqlite3_create_function_v2(),
  **     sqlite3_create_collation_v2(),
  **     sqlite3_create_module_v2(), and/or
  **     sqlite3_vfs_register()
  ** to register the new features that your extension adds.
  */
  rc = initCrsqliteVtab(db, "crsqlite", 0);
  if (rc != SQLITE_OK){
    fprintf(stderr, "SQL error when initializing crsqlite: %s\n", sqlite3_errmsg(db));
    return rc;
  }

  fprintf(stderr, "crsqlite initiated succesfully\n");
  return rc;
}
