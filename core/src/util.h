/**
 * Copyright 2022 One Law LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#ifndef CRSQLITE_UTIL
#define CRSQLITE_UTIL

#include <ctype.h>

#include "crsqlite.h"

size_t crsql_strnlen(const char *s, size_t n);
char *crsql_strndup(const char *s, size_t n);
char *crsql_strdup(const char *s);

char *crsql_getDbVersionUnionQuery(int numRows, char **tableNames);

char *crsql_join(char **in, size_t inlen);

int crsql_doesTableExist(sqlite3 *db, const char *tblName);

int crsql_getCount(sqlite3 *db, char *zSql);

void crsql_joinWith(char *dest, char **src, size_t srcLen, char delim);
char *crsql_asIdentifierListStr(char **idents, size_t identsLen, char delim);

int crsql_getIndexedCols(sqlite3 *db, const char *indexName,
                         char ***pIndexedCols, int *pIndexedColsLen,
                         char **pErrMsg);

char *crsql_join2(char *(*map)(const char *), char **in, size_t len,
                  char *delim);
const char *crsql_identity(const char *x);
int crsql_isIdentifierOpenQuote(char c);
char **crsql_split(const char *in, char *delim, int partsLen);
int crsql_siteIdCmp(const void *zLeft, int leftLen, const void *zRight,
                    int rightLen);
char **crsql_splitQuoteConcat(const char *in, int partsLen);

#endif