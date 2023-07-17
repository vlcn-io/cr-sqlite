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

char *crsql_changes_union_query(crsql_TableInfo **tableInfos, int tableInfosLen,
                                const char *idxStr);
char *crsql_row_patch_data_query(crsql_TableInfo *tblInfo, const char *colName);
int crsql_create_clock_table(sqlite3 *db, crsql_TableInfo *tableInfo,
                             char **err);

#define TBL 0
#define PKS 1
#define CID 2
#define COL_VRSN 3
#define DB_VRSN 4
#define SITE_ID 5
#define CHANGES_ROWID 6
#define SEQ 7

#endif
