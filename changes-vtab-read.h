#ifndef CHANGES_VTAB_READ_H
#define CHANGES_VTAB_READ_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include "tableinfo.h"
#include "changes-vtab-common.h"

char *crsql_changesQueryForTable(crsql_TableInfo *tableInfo);

#define TBL 0
#define PKS 1
#define NUM_COLS 2
#define COL_VRSNS 3
#define MIN_V 4
char *crsql_changesUnionQuery(
    crsql_TableInfo **tableInfos,
    int tableInfosLen);
char *crsql_rowPatchDataQuery(
    sqlite3 *db,
    crsql_TableInfo *tblInfo,
    int numVersionCols,
    const char *colVrsns,
    const char *pks);
crsql_ColumnInfo *crsql_pickColumnInfosFromVersionMap(
  sqlite3 * db,
  crsql_ColumnInfo *columnInfos,
  int columnInfosLen,
  int numVersionCols,
  const char *colVersions);

#endif