#ifndef CFSQLITE_EXT
#define CFSQLITE_EXT

#include "sqlite3ext.h"

SQLITE_EXTENSION_INIT1

#ifndef UNIT_TEST
# define STATIC static
#else
# define STATIC
#endif

typedef struct cfsql_ColumnInfo cfsql_ColumnInfo;
struct cfsql_ColumnInfo
{
  int cid;
  char *name;
  char *type;
  int notnull;
  int pk;
  char *versionOf;
  sqlite3_value *dfltValue;
};

typedef struct cfsql_IndexInfo cfsql_IndexInfo;
struct cfsql_IndexInfo {
  int seq;
  char *name;
  int unique;
  char *origin;
  int partial;
  char **indexedCols;
  int indexedColsLen;
};

typedef struct cfsql_TableInfo cfsql_TableInfo;
struct cfsql_TableInfo {
  // Name of the table. Owned by this struct.
  char *tblName;

  cfsql_ColumnInfo *baseCols;
  int baseColsLen;

  cfsql_ColumnInfo *pks;
  int pksLen;

  cfsql_ColumnInfo *nonPks;
  int nonPksLen;
  // Superset of all other ColumnInfo members.
  // Freeing the column infos contained in this array frees
  // the column infos inside of all the other arrays.
  cfsql_ColumnInfo *withVersionCols;
  int withVersionColsLen;

  cfsql_IndexInfo *indexInfo;
  int indexInfoLen;
};

int cfsql_createClockTable(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err);
int cfsql_createCrrBaseTable(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err);
int cfsql_createViewOfCrr(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err);

#endif