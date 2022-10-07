#ifndef CFSQLITE_NODEP
#define CFSQLITE_NODEP

#include <ctype.h>
#include "cfsqlite.h"

char *cfsql_extractWord(
    int prefixLen,
    char *str);

char *cfsql_getDbVersionUnionQuery(
    int numRows,
    char **tableNames);

char *cfsql_join(char **in, size_t inlen);

int cfsql_doesTableExist(sqlite3 *db, const char *tblName);

int cfsql_getTableInfo(
    sqlite3 *db,
    int tblType,
    const char *tblName,
    cfsql_TableInfo **pTableInfo,
    char **pErrMsg);

int cfsql_getCount(
    sqlite3 *db,
    char *zSql);

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

char *cfsql_asIdentifierList(cfsql_ColumnInfo *in, size_t inlen);

void cfsql_joinWith(char *dest, char** src, size_t srcLen, char delim);

char *cfsql_asColumnDefinitions(cfsql_ColumnInfo *in, size_t inlen);

#endif