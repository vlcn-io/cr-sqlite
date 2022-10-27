#ifndef CHANGES_VTAB_WRITE_H
#define CHANGES_VTAB_WRITE_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include "tableinfo.h"

int *crsql_allReceivedCids(
    sqlite3 *db,
    const unsigned char *colVrsns,
    int totalNumCols,
    int *rNumReceivedCids);

int crsql_mergeInsert(
    sqlite3_vtab *pVTab,
    int argc,
    sqlite3_value **argv,
    sqlite3_int64 *pRowid,
    char **errmsg);

char *crsql_changesTabConflictSets(
    char **nonPkValsForInsert,
    crsql_ColumnInfo *columnInfosForInsert,
    int allChangedCidsLen);

int *crsql_allChangedCids(
    sqlite3 *db,
    const unsigned char *insertColVrsns,
    const unsigned char *insertTbl,
    const char *pkWhereList,
    int totalNumCols,
    int *rlen,
    const void *insertSiteId,
    int insertSiteIdLen,
    char **errmsg);

#endif