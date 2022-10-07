/*
  This file is appended to the end of a sqlite3.c amalgammation
  file to include sqlite3_path functions/tables statically in
  a build. This is used for the demo CLI and WASM implementations.
*/
#include "cfsqlite-ext.h"
#include "uuid.h"

int core_init(const char *dummy) {
  int rc = SQLITE_OK;
  rc = sqlite3_auto_extension((void *)sqlite3_uuid_init);

  if (rc != SQLITE_OK) {
    return rc;
  }

  return sqlite3_auto_extension((void *)sqlite3_cfsqlite_init);
}