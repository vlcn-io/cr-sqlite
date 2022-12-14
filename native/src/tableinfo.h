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

#ifndef CRSQLITE_TABLEINFO_H
#define CRSQLITE_TABLEINFO_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include <ctype.h>
#include <stddef.h>

typedef struct crsql_ColumnInfo crsql_ColumnInfo;
struct crsql_ColumnInfo {
  int cid;
  char *name;
  char *type;
  int notnull;
  int pk;
};

typedef struct crsql_TableInfo crsql_TableInfo;
struct crsql_TableInfo {
  // Name of the table. Owned by this struct.
  char *tblName;

  crsql_ColumnInfo *baseCols;
  int baseColsLen;

  crsql_ColumnInfo *pks;
  int pksLen;

  crsql_ColumnInfo *nonPks;
  int nonPksLen;
};

crsql_ColumnInfo *crsql_extractBaseCols(crsql_ColumnInfo *colInfos,
                                        int colInfosLen, int *pBaseColsLen);

void crsql_freeColumnInfoContents(crsql_ColumnInfo *columnInfo);
void crsql_freeTableInfo(crsql_TableInfo *tableInfo);

int crsql_getTableInfo(sqlite3 *db, const char *tblName,
                       crsql_TableInfo **pTableInfo, char **pErrMsg);

char *crsql_asIdentifierList(crsql_ColumnInfo *in, size_t inlen, char *prefix);

void crsql_freeAllTableInfos(crsql_TableInfo **tableInfos, int len);
crsql_TableInfo *crsql_findTableInfo(crsql_TableInfo **tblInfos, int len,
                                     const char *tblName);
char *crsql_quoteConcat(crsql_ColumnInfo *cols, int len);
int crsql_pullAllTableInfos(sqlite3 *db, crsql_TableInfo ***pzpTableInfos,
                            int *rTableInfosLen, char **errmsg);
int crsql_isTableCompatible(sqlite3 *db, const char *tblName, char **errmsg);
int crsql_columnExists(const char *colName, crsql_ColumnInfo *colInfos,
                       int colInfosLen);

#endif