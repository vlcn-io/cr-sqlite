#ifndef CRSQLITE_TABLEINFO_H
#define CRSQLITE_TABLEINFO_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include <ctype.h>
#include <stddef.h>

// 10 trillion = 10,000,000,000,000
#define ROWID_SLAB_SIZE 10000000000000

typedef struct crsql_ColumnInfo crsql_ColumnInfo;
struct crsql_ColumnInfo {
  int cid;
  char *name;
  char *type;
  int notnull;
  int pk;
};

typedef struct crsql_TableInfo crsql_TableInfo;
struct crsql_TableInfo {
  // Name of the table. Owned by this struct.
  char *tblName;

  crsql_ColumnInfo *pks;
  int pksLen;

  crsql_ColumnInfo *nonPks;
  int nonPksLen;
};

void crsql_freeAllTableInfos(crsql_TableInfo **tableInfos, int len);
crsql_TableInfo *crsql_findTableInfo(crsql_TableInfo **tblInfos, int len,
                                     const char *tblName);
int crsql_indexofTableInfo(crsql_TableInfo **tblInfos, int len,
                           const char *tblName);
sqlite3_int64 crsql_slabRowid(int idx, sqlite3_int64 rowid);
int crsql_pullAllTableInfos(sqlite3 *db, crsql_TableInfo ***pzpTableInfos,
                            int *rTableInfosLen, char **errmsg);

#endif