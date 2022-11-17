#ifndef CHANGES_VTAB_WRITE_H
#define CHANGES_VTAB_WRITE_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include "tableinfo.h"

int crsql_mergeInsert(
    sqlite3_vtab *pVTab,
    int argc,
    sqlite3_value **argv,
    sqlite3_int64 *pRowid,
    char **errmsg);

int crsql_didCidWin(
    sqlite3 *db,
    const unsigned char *localSiteId,
    const char *insertTbl,
    const char *pkWhereList,
    const void *insertSiteId,
    int insertSiteIdLen,
    int cid,
    sqlite3_int64 version,
    char **errmsg);

#endif