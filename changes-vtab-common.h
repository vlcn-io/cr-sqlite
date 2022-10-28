#ifndef CHANGES_VTAB_COMMON_H
#define CHANGES_VTAB_COMMON_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3
#include "tableinfo.h"

#define CHANGES_SINCE_VTAB_TBL 0
#define CHANGES_SINCE_VTAB_PK 1
#define CHANGES_SINCE_VTAB_CID 2
#define CHANGES_SINCE_VTAB_CVAL 3
#define CHANGES_SINCE_VTAB_VRSN 4
#define CHANGES_SINCE_VTAB_SITE_ID 5

char *crsql_extractWhereList(
    crsql_ColumnInfo *zColumnInfos,
    int columnInfosLen,
    const char *quoteConcatedVals);

char *crsql_quotedValuesAsList(char **parts, int len);
char *crsql_quoteConcatedValuesAsList(
    const char *quoteConcatedVals,
    int len);

#endif