#ifndef CHANGES_VTAB_READ_H
#define CHANGES_VTAB_READ_H

#include "tableinfo.h"

char *crsql_changesQueryForTable(crsql_TableInfo *tableInfo);

#define TBL 0
#define PKS 1
#define NUM_COLS 2
#define COL_VRSNS 3
#define MIN_V 4
char *crsql_changesUnionQuery(
    crsql_TableInfo **tableInfos,
    int tableInfosLen);

#endif