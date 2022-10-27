#ifndef CHANGES_VTAB_COMMON_H
#define CHANGES_VTAB_COMMON_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3
#include "tableinfo.h"

char *crsql_extractPkWhereList(
    crsql_TableInfo *tblInfo,
    const char *pks);

#endif