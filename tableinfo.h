#ifndef CFSQLITE_TABLEINFO_H
#define CFSQLITE_TABLEINFO_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include <ctype.h>

typedef struct cfsql_ColumnInfo cfsql_ColumnInfo;
struct cfsql_ColumnInfo
{
  int cid;
  char *name;
  char *type;
  int notnull;
  int pk;
  char *versionOf;
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

  cfsql_IndexInfo *indexInfo;
  int indexInfoLen;
};

cfsql_ColumnInfo *cfsql_extractBaseCols(
    cfsql_ColumnInfo *colInfos,
    int colInfosLen,
    int *pBaseColsLen);

void cfsql_freeColumnInfoContents(cfsql_ColumnInfo *columnInfo);

void cfsql_freeTableInfo(cfsql_TableInfo *tableInfo);

int cfsql_getTableInfo(
    sqlite3 *db,
    const char *tblName,
    cfsql_TableInfo **pTableInfo,
    char **pErrMsg);

char *cfsql_asIdentifierList(cfsql_ColumnInfo *in, size_t inlen, char *prefix);

int cfsql_getIndexList(
    sqlite3 *db,
    const char *tblName,
    cfsql_IndexInfo **pIndexInfos,
    int *pIndexInfosLen,
    char **pErrMsg);

#endif