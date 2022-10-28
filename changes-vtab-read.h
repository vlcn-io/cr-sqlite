#ifndef CHANGES_VTAB_READ_H
#define CHANGES_VTAB_READ_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include "tableinfo.h"
#include "changes-vtab-common.h"

char *crsql_changesQueryForTable(crsql_TableInfo *tableInfo);

#define TBL 0
#define PKS 1
#define CID 2
#define VRSN 3
#define SITE_ID 4
char *crsql_changesUnionQuery(
    crsql_TableInfo **tableInfos,
    int tableInfosLen);
char *crsql_rowPatchDataQuery(
    sqlite3 *db,
    crsql_TableInfo *tblInfo,
    int cid,
    const char *pks);

#endif