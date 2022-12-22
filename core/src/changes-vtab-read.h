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

#ifndef CHANGES_VTAB_READ_H
#define CHANGES_VTAB_READ_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include "changes-vtab-common.h"
#include "tableinfo.h"

char *crsql_changesQueryForTable(crsql_TableInfo *tableInfo, int idxNum);

#define TBL 0
#define PKS 1
#define CID 2
#define COL_VRSN 3
#define DB_VRSN 4
#define SITE_ID 5
char *crsql_changesUnionQuery(crsql_TableInfo **tableInfos, int tableInfosLen,
                              int idxNum);
char *crsql_rowPatchDataQuery(sqlite3 *db, crsql_TableInfo *tblInfo,
                              const char *colName, const char *pks);

#endif