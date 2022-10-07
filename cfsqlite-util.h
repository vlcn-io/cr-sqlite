#ifndef CFSQLITE_UTIL
#define CFSQLITE_UTIL

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

int cfsql_getCount(sqlite3 *db, char *zSql);

void cfsql_joinWith(char *dest, char **src, size_t srcLen, char delim);
char *cfsql_asIdentifierListStr(char **idents, size_t identsLen, char delim);

int cfsql_getIndexedCols(
    sqlite3 *db,
    const char *indexName,
    char ***pIndexedCols,
    int *pIndexedColsLen);

#endif