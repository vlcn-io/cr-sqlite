#ifndef CRSQLITE_CONSTS_H
#define CRSQLITE_CONSTS_H

#define MIN_POSSIBLE_DB_VERSION -9223372036854775807L

#define __CRSQL_CLOCK_LEN 13
#define PK_DELIM "~'~"
#define PK_DELIM_LEN 3

#define DELETE_CID_SENTINEL -1

#define CRR_SPACE 0
#define USER_SPACE 1

#define CLOCK_TABLES_SELECT "SELECT tbl_name FROM sqlite_master WHERE type='table' AND tbl_name LIKE '%__crsql_clock'"

#define SET_SYNC_BIT "select crsql_internal_sync_bit(1)"
#define CLEAR_SYNC_BIT "select crsql_internal_sync_bit(0)"

#define TBL_SITE_ID "__crsql_siteid"
#define TBL_DB_VERSION "__crsql_dbversion"
#define UNION "UNION"

#endif