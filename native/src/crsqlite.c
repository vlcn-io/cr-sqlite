#include "crsqlite.h"
SQLITE_EXTENSION_INIT1

#include "util.h"
#include "tableinfo.h"
#include "consts.h"
#include "triggers.h"
#include "changes-vtab.h"
#include "ext-data.h"

#include <ctype.h>
#include <stdint.h>
#include <string.h>
#include <limits.h>
#include <assert.h>
#include <stdatomic.h>


static void uuid(unsigned char *blob)
{
  sqlite3_randomness(16, blob);
  blob[6] = (blob[6] & 0x0f) + 0x40;
  blob[8] = (blob[8] & 0x3f) + 0x80;
}

/**
 * The site id table is used to persist the site id and
 * populate `siteIdBlob` on initialization of a connection.
 */
static int createSiteIdAndSiteIdTable(sqlite3 *db, unsigned char *ret)
{
  int rc = SQLITE_OK;
  sqlite3_stmt *pStmt = 0;
  char *zSql = 0;

  zSql = sqlite3_mprintf(
      "CREATE TABLE \"%s\" (site_id)",
      TBL_SITE_ID);
  rc = sqlite3_exec(db, zSql, 0, 0, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    return rc;
  }

  zSql = sqlite3_mprintf("INSERT INTO \"%s\" (site_id) VALUES(?)", TBL_SITE_ID);
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    sqlite3_finalize(pStmt);
    return rc;
  }

  uuid(ret);
  rc = sqlite3_bind_blob(pStmt, 1, ret, SITE_ID_LEN, SQLITE_STATIC);
  if (rc != SQLITE_OK)
  {
    return rc;
  }
  rc = sqlite3_step(pStmt);
  if (rc != SQLITE_DONE)
  {
    sqlite3_finalize(pStmt);
    return rc;
  }

  sqlite3_finalize(pStmt);
  return SQLITE_OK;
}

/**
 * Loads the siteId into memory. If a site id
 * cannot be found for the given database one is created
 * and saved to the site id table.
 */
static int initSiteId(sqlite3 *db, unsigned char *ret)
{
  char *zSql = 0;
  sqlite3_stmt *pStmt = 0;
  int rc = SQLITE_OK;
  int tableExists = 0;
  const void *siteIdFromTable = 0;

  // look for site id table
  tableExists = crsql_doesTableExist(db, TBL_SITE_ID);

  if (tableExists == 0)
  {
    return createSiteIdAndSiteIdTable(db, ret);
  }

  // read site id from the table and return it
  zSql = sqlite3_mprintf("SELECT site_id FROM %Q", TBL_SITE_ID);
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    return rc;
  }

  rc = sqlite3_step(pStmt);
  if (rc != SQLITE_ROW)
  {
    sqlite3_finalize(pStmt);
    return rc;
  }

  siteIdFromTable = sqlite3_column_blob(pStmt, 0);
  memcpy(ret, siteIdFromTable, SITE_ID_LEN);
  sqlite3_finalize(pStmt);

  return SQLITE_OK;
}

/**
 * return the uuid which uniquely identifies this database.
 *
 * `select crsql_siteid()`
 *
 * @param context
 * @param argc
 * @param argv
 */
static void siteIdFunc(sqlite3_context *context, int argc, sqlite3_value **argv)
{
  crsql_ExtData *pExtData = (crsql_ExtData *)sqlite3_user_data(context);
  sqlite3_result_blob(context, pExtData->siteId, SITE_ID_LEN, SQLITE_STATIC);
}

/**
 * Return the current version of the database.
 *
 * `select crsql_dbversion()`
 */
static void dbVersionFunc(sqlite3_context *context, int argc, sqlite3_value **argv)
{
  char *errmsg = 0;
  crsql_ExtData *pExtData = (crsql_ExtData *)sqlite3_user_data(context);
  sqlite3 *db = sqlite3_context_db_handle(context);
  int rc = crsql_getDbVersion(db, pExtData, &errmsg);
  if (rc != SQLITE_OK) {
    sqlite3_result_error(context, errmsg, -1);
    sqlite3_free(errmsg);
    return;
  }

  sqlite3_result_int64(context, pExtData->dbVersion);
}

/**
 * Return the next version of the database for use in inserts/updates/deletes
 *
 * `select crsql_nextdbversion()`
 */
static void nextDbVersionFunc(sqlite3_context *context, int argc, sqlite3_value **argv)
{
  char *errmsg = 0;
  crsql_ExtData *pExtData = (crsql_ExtData *)sqlite3_user_data(context);
  sqlite3 *db = sqlite3_context_db_handle(context);
  int rc = crsql_getDbVersion(db, pExtData, &errmsg);
  if (rc != SQLITE_OK) {
    sqlite3_result_error(context, errmsg, -1);
    sqlite3_free(errmsg);
    return;
  }
  
  sqlite3_result_int64(context, pExtData->dbVersion + 1);
}

/**
 * The clock table holds the versions for each column of a given row.
 *
 * These version are set to the dbversion at the time of the write to the column.
 *
 * The dbversion is updated on transaction commit.
 * This allows us to find all columns written in the same transaction
 * albeit with caveats.
 *
 * The caveats being that two partiall overlapping transactions will
 * clobber the full transaction picture given we only keep latest
 * state and not a full causal history.
 *
 * @param tableInfo
 */
int crsql_createClockTable(
    sqlite3 *db,
    crsql_TableInfo *tableInfo,
    char **err)
{
  char *zSql = 0;
  char *pkList = 0;
  int rc = SQLITE_OK;

  // drop the table if it exists. This will drop versions so we should
  // put in place a path to preserve versions across schema updates.
  // copy the data to a temp table, re-create this table, copy it back.
  // of course if columns were re-ordered versions are pinned to the wrong columns.
  // TODO: incorporate schema name!
  // TODO: allow re-running `as_crr` against a table to incorporate schema changes
  // only schema changes to concern ourselves with:
  // - dropped columns
  // - new primary key columns
  // zSql = sqlite3_mprintf("DROP TABLE IF EXISTS \"%s__crsql_clock\"", tableInfo->tblName);
  // rc = sqlite3_exec(db, zSql, 0, 0, err);
  // sqlite3_free(zSql);
  // if (rc != SQLITE_OK)
  // {
  //   return rc;
  // }

  // TODO: just forbid tables w/o primary keys
  if (tableInfo->pksLen == 0)
  {
    zSql = sqlite3_mprintf("CREATE TABLE IF NOT EXISTS \"%s__crsql_clock\" (\
      \"rowid\" NOT NULL,\
      \"__crsql_col_num\" NOT NULL,\
      \"__crsql_version\" NOT NULL,\
      \"__crsql_site_id\",\
      PRIMARY KEY (\"rowid\", \"__crsql_col_num\")\
    )",
                           tableInfo->tblName);
  }
  else
  {
    pkList = crsql_asIdentifierList(
        tableInfo->pks,
        tableInfo->pksLen,
        0);
    zSql = sqlite3_mprintf("CREATE TABLE IF NOT EXISTS \"%s__crsql_clock\" (\
      %s,\
      \"__crsql_col_num\" NOT NULL,\
      \"__crsql_version\" NOT NULL,\
      \"__crsql_site_id\",\
      PRIMARY KEY (%s, __crsql_col_num)\
    )",
                           tableInfo->tblName, pkList, pkList);
    sqlite3_free(pkList);
  }

  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);
  if (rc != SQLITE_OK)
  {
    return rc;
  }

  zSql = sqlite3_mprintf(
      "CREATE INDEX IF NOT EXISTS \"%s__crsql_clock_v_idx\" ON \"%s__crsql_clock\" (__crsql_version)",
      tableInfo->tblName,
      tableInfo->tblName);
  sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);

  return rc;
}

/**
 * Create a new crr --
 * all triggers, views, tables
 */
static int createCrr(
    sqlite3_context *context,
    sqlite3 *db,
    const char *schemaName,
    const char *tblName,
    char **err)
{
  int rc = SQLITE_OK;
  crsql_TableInfo *tableInfo = 0;

  rc = crsql_getTableInfo(
      db,
      tblName,
      &tableInfo,
      err);

  if (rc != SQLITE_OK)
  {
    crsql_freeTableInfo(tableInfo);
    return rc;
  }

  rc = crsql_createClockTable(db, tableInfo, err);
  if (rc == SQLITE_OK)
  {
    rc = crsql_removeCrrTriggersIfExist(db, tableInfo, err);
    if (rc == SQLITE_OK) {
      rc = crsql_createCrrTriggers(db, tableInfo, err);
    }
  }

  crsql_freeTableInfo(tableInfo);
  return rc;
}

static void crsqlSyncBit(sqlite3_context *context, int argc, sqlite3_value **argv)
{
  int *syncBit = (int *)sqlite3_user_data(context);

  // No args? We're reading the value of the bit.
  if (argc == 0)
  {
    sqlite3_result_int(context, *syncBit);
    return;
  }

  // Args? We're setting the value of the bit
  int newValue = sqlite3_value_int(argv[0]);
  *syncBit = newValue;
}

/**
 * Takes a table name and turns it into a CRR.
 *
 * This allows users to create and modify tables as normal.
 */
static void crsqlMakeCrrFunc(sqlite3_context *context, int argc, sqlite3_value **argv)
{
  const char *tblName = 0;
  const char *schemaName = 0;
  int rc = SQLITE_OK;
  sqlite3 *db = sqlite3_context_db_handle(context);
  char *errmsg = 0;

  if (argc == 0)
  {
    sqlite3_result_error(context, "Wrong number of args provided to crsql_as_crr. Provide the schema name and table name or just the table name.", -1);
    return;
  }

  if (argc == 2)
  {
    schemaName = (const char *)sqlite3_value_text(argv[0]);
    tblName = (const char *)sqlite3_value_text(argv[1]);
  }
  else
  {
    schemaName = "main";
    tblName = (const char *)sqlite3_value_text(argv[0]);
  }

  rc = sqlite3_exec(db, "SAVEPOINT as_crr", 0, 0, &errmsg);
  if (rc != SQLITE_OK)
  {
    sqlite3_result_error(context, errmsg, -1);
    sqlite3_free(errmsg);
    return;
  }

  rc = createCrr(context, db, schemaName, tblName, &errmsg);
  if (rc != SQLITE_OK)
  {
    sqlite3_result_error(context, errmsg, -1);
    sqlite3_free(errmsg);
    sqlite3_exec(db, "ROLLBACK TO as_crr", 0, 0, 0);
    return;
  }

  sqlite3_exec(db, "RELEASE as_crr", 0, 0, 0);
}

static void freeConnectionExtData(void * pUserData) {
  crsql_ExtData *pExtData = (crsql_ExtData*)pUserData;

  crsql_freeExtData(pExtData);
}

static void crsqlFinalize(sqlite3_context *context, int argc, sqlite3_value **argv) {
  crsql_ExtData *pExtData = (crsql_ExtData *)sqlite3_user_data(context);
  crsql_finalize(pExtData);
}

static int commitHook(void *pUserData) {
  crsql_ExtData *pExtData = (crsql_ExtData *)pUserData;

  pExtData->dbVersion = -1;
  return SQLITE_OK;
}

static void rollbackHook(void *pUserData) {
  crsql_ExtData *pExtData = (crsql_ExtData *)pUserData;

  pExtData->dbVersion = -1;
}

#ifdef _WIN32
__declspec(dllexport)
#endif
    int sqlite3_crsqlite_init(sqlite3 *db, char **pzErrMsg,
                              const sqlite3_api_routines *pApi)
{
  int rc = SQLITE_OK;

  SQLITE_EXTENSION_INIT2(pApi);

  crsql_ExtData *pExtData = crsql_newExtData(db);
  if (pExtData == 0) {
    return SQLITE_ERROR;
  }

  initSiteId(db, pExtData->siteId);

  if (rc == SQLITE_OK)
  {
    rc = sqlite3_create_function(db, "crsql_siteid", 0,
                                 // siteid never changes -- deterministic and innnocuous
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS |
                                     SQLITE_DETERMINISTIC,
                                 pExtData, siteIdFunc, 0, 0);
  }
  if (rc == SQLITE_OK)
  {
    rc = sqlite3_create_function_v2(db, "crsql_dbversion", 0,
                                 // dbversion can change on each invocation.
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS,
                                 pExtData, dbVersionFunc, 0, 0, freeConnectionExtData);
  }
  if (rc == SQLITE_OK)
  {
    rc = sqlite3_create_function(db, "crsql_nextdbversion", 0,
                                 // dbversion can change on each invocation.
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS,
                                 pExtData, nextDbVersionFunc, 0, 0);
  }

  if (rc == SQLITE_OK)
  {
    // Only register a commit hook, not update or pre-update, since all rows in the same transaction
    // should have the same clock value.
    // This allows us to replicate them together and ensure more consistency.
    rc = sqlite3_create_function(db, "crsql_as_crr", -1,
                                 // crsql should only ever be used at the top level
                                 // and does a great deal to modify
                                 // existing database state. directonly.
                                 SQLITE_UTF8 | SQLITE_DIRECTONLY,
                                 0, crsqlMakeCrrFunc, 0, 0);
  }

  if (rc == SQLITE_OK) {
    // see https://sqlite.org/forum/forumpost/c94f943821
    rc = sqlite3_create_function(db, "crsql_finalize", -1, SQLITE_UTF8 | SQLITE_DIRECTONLY, pExtData, crsqlFinalize, 0, 0);
  }

  if (rc == SQLITE_OK)
  {
    // Register a thread & connection local bit to toggle on or off
    // our triggers depending on the source of updates to a table.
    int *syncBit = sqlite3_malloc(sizeof *syncBit);
    *syncBit = 0;
    rc = sqlite3_create_function_v2(
        db,
        "crsql_internal_sync_bit",
        -1,                             // num args: -1 -> 0 or more
        SQLITE_UTF8 | SQLITE_INNOCUOUS, // configuration
        syncBit,                        // user data
        crsqlSyncBit,
        0,           // step
        0,           // final
        sqlite3_free // destroy / free syncBit
    );
  }

  if (rc == SQLITE_OK)
  {
    rc = sqlite3_create_module_v2(
        db,
        "crsql_changes",
        &crsql_changesModule,
        pExtData,
        0);
  }

  if (rc == SQLITE_OK) {
    // TODO: get the prior callback so we can call it rather than replace it?
    sqlite3_commit_hook(db, commitHook, pExtData);
    sqlite3_rollback_hook(db, rollbackHook, pExtData);
  }

  return rc;
}