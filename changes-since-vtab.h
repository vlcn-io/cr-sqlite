#if !defined(SQLITEINT_H)
#include "sqlite3ext.h"
#endif
SQLITE_EXTENSION_INIT3

#include "tableinfo.h"

sqlite3_module crsql_changesSinceModule;

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