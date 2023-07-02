#ifndef CRSQLITE_RUST_H
#define CRSQLITE_RUST_H

// Parts of CR-SQLite are written in Rust and parts are in C.
// As we gradually convert more code to Rust, we'll have to expose
// structures to the old C-code that hasn't been converted yet.
// These are those definitions.

typedef struct RawVec {
  void *ptr;
  int len;
  int cap;
} RawVec;

struct RawVec crsql_unpack_columns(const unsigned char *packed_columns,
                                   int packed_columns_len);

int crsql_bind_unpacked_values(sqlite3_stmt *stmt, struct RawVec columns);

int crsql_backfill_table(sqlite3_context *context, const char *tblName,
                         const char **zpkNames, int pkCount,
                         const char **zNonPkNames, int nonPkCount,
                         int isCommitAlter);
int crsql_is_crr(sqlite3 *db, const char *tblName);
int crsql_compare_sqlite_values(const sqlite3_value *l, const sqlite3_value *r);

#endif
