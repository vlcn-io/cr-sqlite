#ifndef CRSQLITE_RUST_H
#define CRSQLITE_RUST_H

#include "crsqlite.h"

// Parts of CR-SQLite are written in Rust and parts are in C.
// As we gradually convert more code to Rust, we'll have to expose
// structures to the old C-code that hasn't been converted yet.
// These are those definitions.

typedef struct RawVec RawVec;
struct RawVec {
  void *ptr;
  int len;
  int cap;
};

RawVec crsql_unpack_columns(sqlite3_value *value);

int crsql_bind_unpacked_values(sqlite3_stmt *stmt, RawVec columns);

int crsql_backfill_table(sqlite3_context *context, const char *tblName,
                         const char **zpkNames, int pkCount,
                         const char **zNonPkNames, int nonPkCount,
                         int isCommitAlter);
int crsql_is_crr(sqlite3 *db, const char *tblName);
int crsql_compare_sqlite_values(const sqlite3_value *l, const sqlite3_value *r);
void crsql_free_unpacked_values(RawVec columns);
int crsql_create_crr_triggers(sqlite3 *db, crsql_TableInfo *tableInfo,
                              char **err);
int crsql_remove_crr_triggers_if_exist(sqlite3 *db, const char *tblName);

#endif
