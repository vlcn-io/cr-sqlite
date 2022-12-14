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

#ifndef CHANGES_VTAB_COMMON_H
#define CHANGES_VTAB_COMMON_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3
#include "tableinfo.h"

#define CHANGES_SINCE_VTAB_TBL 0
#define CHANGES_SINCE_VTAB_PK 1
#define CHANGES_SINCE_VTAB_CID 2
#define CHANGES_SINCE_VTAB_CVAL 3
#define CHANGES_SINCE_VTAB_VRSN 4
#define CHANGES_SINCE_VTAB_SITE_ID 5

char *crsql_extractWhereList(crsql_ColumnInfo *zColumnInfos, int columnInfosLen,
                             const char *quoteConcatedVals);

char *crsql_quotedValuesAsList(char **parts, int len);
char *crsql_quoteConcatedValuesAsList(const char *quoteConcatedVals, int len);

#endif