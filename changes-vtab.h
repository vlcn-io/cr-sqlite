#if !defined(SQLITEINT_H)
#include "sqlite3ext.h"
#endif
SQLITE_EXTENSION_INIT3

#include "tableinfo.h"
#include <stdint.h>

sqlite3_module crsql_changesModule;

/**
 * Data maintained by the virtual table across
 * queries.
 *
 * Per-query data is kept on crsql_Changes_cursor
 *
 * All table infos are fetched on vtab initialization.
 * This creates the constraint that if the schema of a crr
 * is modified after the virtual table definition is loaded
 * then it will not be or not be correctly processed
 * by the virtual table.
 *
 * Given that, if a schema modification is made
 * to a crr table then the changes vtab needs to be
 * reloaded.
 *
 * The simpleset way to accomplish this is to close
 * and re-open the connection responsible for syncing.
 *
 * In practice this should generally not be a problem
 * as application startup would establish, migrated, etc. the schemas
 * after which a sync process would connect.
 */
typedef struct crsql_Changes_vtab crsql_Changes_vtab;
struct crsql_Changes_vtab
{
  sqlite3_vtab base;
  sqlite3 *db;

  crsql_TableInfo **tableInfos;
  int tableInfosLen;

  int64_t maxSeenPatchVersion;
};

/**
 * Cursor used to return patches.
 * This is instantiated per-query and updated
 * on each row being returned.
 *
 * Contains a reference to the vtab structure in order
 * get a handle on the db which to fetch from
 * the underlying crr tables.
 *
 * Most columns are passed-through from
 * `pChangesStmt` and `pRowStmt` which are stepped
 * in each call to `changesNext`.
 *
 * `colVersion` is copied given it is unclear
 * what the behavior is of calling `sqlite3_column_x` on
 * the same column multiple times with, potentially,
 * different types.
 *
 * `colVersions` is used in the implementation as
 * a text column in order to fetch the correct columns
 * from the physical row.
 *
 * Everything allocated here must be constructed in
 * changesOpen and released in changesCrsrFinalize
 */
typedef struct crsql_Changes_cursor crsql_Changes_cursor;
struct crsql_Changes_cursor
{
  sqlite3_vtab_cursor base;

  crsql_Changes_vtab *pTab;

  sqlite3_stmt *pChangesStmt;
  sqlite3_stmt *pRowStmt;

  const char *colVrsns;
  sqlite3_int64 version;
};

char *crsql_changesQueryForTable(crsql_TableInfo *tableInfo);
char *crsql_changesUnionQuery(
    crsql_TableInfo **tableInfos,
    int tableInfosLen);
crsql_ColumnInfo *crsql_pickColumnInfosFromVersionMap(
  sqlite3 * db,
  crsql_ColumnInfo *columnInfos,
  int columnInfosLen,
  int numVersionCols,
  const char *colVersions);
char *crsql_rowPatchDataQuery(
    sqlite3 *db,
    crsql_TableInfo *tblInfo,
    int numCols,
    const char *colVrsns,
    const char *pks);
int *crsql_allReceivedCids(
  sqlite3 *db,
  const unsigned char *colVrsns,
  int totalNumCols,
  int *rNumReceivedCids);