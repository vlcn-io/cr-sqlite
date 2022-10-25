#ifndef CRSQLITE_CONSTS_H
#define CRSQLITE_CONSTS_H

#define MIN_POSSIBLE_DB_VERSION -9223372036854775807L

#define CREATE_TABLE_LEN 12
#define CREATE_TEMP_TABLE_LEN 17
#define ALTER_TABLE_LEN 11
#define CREATE_INDEX_LEN 12
#define CREATE_UNIQUE_INDEX_LEN 19
#define DROP_INDEX_LEN 10
#define DROP_TABLE_LEN 10
#define CRSQL_TMP__LEN 11
#define TEMP_LEN 4
#define SPACE_LEN 1
#define __CRSQL_CLOCK_LEN 13
#define PK_DELIM "~'~"
#define PK_DELIM_LEN 3

#define DELETE_CLOCK_SENTINEL -1

#define CRR_SPACE 0
#define USER_SPACE 1

// CREATE TEMP TABLE crsql_tmp__
#define CREATE_TEMP_TABLE_CRSQL_LEN CREATE_TEMP_TABLE_LEN + SPACE_LEN + CRSQL_TMP__LEN

#define CLOCK_TABLES_SELECT "SELECT tbl_name FROM sqlite_master WHERE type='table' AND tbl_name LIKE '%__crsql_clock'"

#define SET_SYNC_BIT "select crsql_internal_sync_bit(1)"
#define CLEAR_SYNC_BIT "select crsql_internal_sync_bit(0)"

#define TBL_SITE_ID "__crsql_siteid"
#define TBL_DB_VERSION "__crsql_dbversion"
#define UNION "UNION"

#endif