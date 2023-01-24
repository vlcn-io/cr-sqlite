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

#ifndef CRSQLITE_CONSTS_H
#define CRSQLITE_CONSTS_H

// db version is a signed 64bit int since sqlite doesn't support saving and
// retrieving unsigned 64bit ints. (2^64 / 2) is a big enough number to write 1
// million entries per second for 3,000 centuries.
#define MIN_POSSIBLE_DB_VERSION 0L

#define __CRSQL_CLOCK_LEN 13
// NB: crsql_quoteConcat
#define QC_DELIM '|'

#define DELETE_CID_SENTINEL "__crsql_del"
#define PKS_ONLY_CID_SENTINEL "__crsql_pko"

#define CRR_SPACE 0
#define USER_SPACE 1

#define CLOCK_TABLES_SELECT                                                  \
  "SELECT tbl_name FROM sqlite_master WHERE type='table' AND tbl_name LIKE " \
  "'%__crsql_clock'"

#define SET_SYNC_BIT "select crsql_internal_sync_bit(1)"
#define CLEAR_SYNC_BIT "select crsql_internal_sync_bit(0)"

#define TBL_SITE_ID "__crsql_siteid"
#define TBL_DB_VERSION "__crsql_dbversion"
#define TBL_SCHEMA "__crsql_master"
#define TBL_SCHEMA_PROPS "__crsql_master_prop"
#define UNION "UNION"

#define MAX_TBL_NAME_LEN 2048
#define SITE_ID_LEN 16

#endif
