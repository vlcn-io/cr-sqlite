#ifndef CHANGES_VTAB_COMMON_H
#define CHANGES_VTAB_COMMON_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3
#include "tableinfo.h"

#define CHANGES_SINCE_VTAB_TBL 0
#define CHANGES_SINCE_VTAB_PK 1
#define CHANGES_SINCE_VTAB_CID 2
#define CHANGES_SINCE_VTAB_CVAL 3
#define CHANGES_SINCE_VTAB_COL_VRSN 4
#define CHANGES_SINCE_VTAB_DB_VRSN 5
#define CHANGES_SINCE_VTAB_SITE_ID 6
#define CHANGES_SINCE_VTAB_SEQ 7

char *crsql_extractWhereList(crsql_ColumnInfo *zColumnInfos,
                             int columnInfosLen);

char *crsql_bindingList(int numSlots);

#endif