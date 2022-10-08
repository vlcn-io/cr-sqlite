#ifndef CFSQLITE_TABLEINFO
#define CFSQLITE_TABLEINFO

#include <ctype.h>
#include "cfsqlite.h"

cfsql_ColumnInfo *cfsql_extractBaseCols(
    cfsql_ColumnInfo *colInfos,
    int colInfosLen,
    int *pBaseColsLen);

void cfsql_freeColumnInfoContents(cfsql_ColumnInfo *columnInfo);

cfsql_ColumnInfo *cfsql_addVersionCols(
    cfsql_ColumnInfo *colInfos,
    int colInfosLen,
    int *pCrrColsLen);

void cfsql_freeTableInfo(cfsql_TableInfo *tableInfo);

int cfsql_getTableInfo(
    sqlite3 *db,
    int tblType,
    const char *tblName,
    cfsql_TableInfo **pTableInfo,
    char **pErrMsg);

char *cfsql_asColumnDefinitions(cfsql_ColumnInfo *in, size_t inlen);

char *cfsql_asIdentifierList(cfsql_ColumnInfo *in, size_t inlen, char *prefix);

int cfsql_getIndexList(
    sqlite3 *db,
    const char *tblName,
    cfsql_IndexInfo **pIndexInfos,
    int *pIndexInfosLen,
    char **pErrMsg);

#endif