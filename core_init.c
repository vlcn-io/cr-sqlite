/*
  This file is appended to the end of a sqlite3.c amalgammation
  file to include crsqlite functions statically in
  a build. This is used for the demo CLI and WASM implementations.
*/
#include "ext.h"

int core_init(const char *dummy) {
  int rc = SQLITE_OK;

  rc = sqlite3_crsqlite_preinit();
  if (rc == SQLITE_OK) {
    rc = sqlite3_auto_extension((void *)sqlite3_crsqlite_init);
  }
  
  return rc;
}