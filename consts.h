#ifndef CFSQLITE_CONSTS
#define CFSQLITE_CONSTS

#define CREATE_TABLE_LEN 12
#define CREATE_TEMP_TABLE_LEN 17
#define ALTER_TABLE_LEN 11
#define CREATE_INDEX_LEN 12
#define CREATE_UNIQUE_INDEX_LEN 19
#define DROP_INDEX_LEN 10
#define DROP_TABLE_LEN 10
#define CFSQL_TMP__LEN 11
#define TEMP_LEN 4
#define SPACE_LEN 1

#define CRR_SPACE 0
#define USER_SPACE 1

// CREATE TEMP TABLE cfsql_tmp__
#define CREATE_TEMP_TABLE_CFSQL_LEN CREATE_TEMP_TABLE_LEN + SPACE_LEN + CFSQL_TMP__LEN

static const char *const TBL_SITE_ID = "__cfsql_siteid";
static const char *const TBL_DB_VERSION = "__cfsql_dbversion";
static const char *const UNION = "UNION";

#endif