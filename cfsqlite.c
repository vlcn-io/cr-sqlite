#include "cfsqlite.h"
SQLITE_EXTENSION_INIT1

#include "util.h"
#include "tableinfo.h"
#include "consts.h"
#include "triggers.h"

#include <ctype.h>
#include <stdint.h>
#include <string.h>
#include <limits.h>
#include <assert.h>

/**
 * Global variables to hold the site id and db version.
 * This prevents us from having to query the tables that store
 * these values every time we do a read or write.
 *
 * The db version must be correctly updated on every write transaction.
 * All writes within the same transaction must use the same db version.
 * The reason for this is so we can replicate all rows changed by
 * a given transaction together and commit them together on the
 * other end.
 *
 * DB version is incremented on trnsaction commit via a
 * commit hook.
 */
static unsigned char siteIdBlob[] = {
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};
// track if siteId was set so we don't re-initialize site id on new connections
static int siteIdSet = 0;
static const size_t siteIdBlobSize = sizeof(siteIdBlob);

/**
 * Cached representation of the version of the database.
 *
 * This is not an unsigned int since sqlite does not support unsigned ints
 * as a data type and we do eventually write db version(s) to the db.
 *
 */
static _Atomic int64_t dbVersion = -9223372036854775807L;
static int dbVersionSet = 0;

static sqlite3_mutex *globalsInitMutex = 0;
static int sharedMemoryInitialized = 0;

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
static int createSiteIdTable(sqlite3 *db)
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

  assert(siteIdSet == 0);

  zSql = sqlite3_mprintf("INSERT INTO \"%s\" (site_id) VALUES(?)", TBL_SITE_ID);
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    sqlite3_finalize(pStmt);
    return rc;
  }

  uuid(siteIdBlob);
  rc = sqlite3_bind_blob(pStmt, 1, siteIdBlob, siteIdBlobSize, SQLITE_STATIC);
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
static int initSiteId(sqlite3 *db)
{
  char *zSql = 0;
  sqlite3_stmt *pStmt = 0;
  int rc = SQLITE_OK;
  int tableExists = 0;
  const void *siteIdFromTable = 0;

  // We were already initialized by another connection
  if (siteIdSet != 0)
  {
    return rc;
  }

  // look for site id tablesql
  tableExists = cfsql_doesTableExist(db, TBL_SITE_ID);

  if (tableExists == 0)
  {
    // create the table
    // generate the site id
    // insert it
    rc = createSiteIdTable(db);
    if (rc != SQLITE_OK)
    {
      return rc;
    }
  }

  // read site id from the table and save to global
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
  // the blob mem returned to us will be freed so copy it.
  // https://www.sqlite.org/c3ref/column_blob.html
  memcpy(siteIdBlob, siteIdFromTable, siteIdBlobSize);
  siteIdSet = 1;

  sqlite3_finalize(pStmt);
  return SQLITE_OK;
}

/**
 * Computes the current version of the database
 * and saves it in the global variable.
 * The version is incremented on every transaction commit.
 * The version is used on every write to update clock values for the
 * rows written.
 *
 * INIT DB VERSION MUST BE CALLED AFTER SITE ID INITIALIZATION
 */
static int initDbVersion(sqlite3 *db)
{
  char *zSql;
  sqlite3_stmt *pStmt = 0;
  int rc = SQLITE_OK;
  char **rClockTableNames = 0;
  int rNumRows = 0;
  int rNumCols = 0;
  int i = 0;

  // already initialized?
  if (dbVersionSet != 0)
  {
    return rc;
  }

  // find all `clock` tables
  rc = sqlite3_get_table(
      db,
      "SELECT tbl_name FROM sqlite_master WHERE type='table' AND tbl_name LIKE '%__cfsql_clock'",
      &rClockTableNames,
      &rNumRows,
      &rNumCols,
      0);

  if (rc != SQLITE_OK)
  {
    sqlite3_free_table(rClockTableNames);
    return rc;
  }

  if (rNumRows == 0)
  {
    dbVersionSet = 1;
    sqlite3_free_table(rClockTableNames);
    return rc;
  }

  // builds the query string
  zSql = cfsql_getDbVersionUnionQuery(rNumRows, rClockTableNames);
  sqlite3_free_table(rClockTableNames);
  // now prepare the statement
  // and bind site id param
  rc = sqlite3_prepare_v2(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    return rc;
  }

  if (rc != SQLITE_OK)
  {
    sqlite3_finalize(pStmt);
    return rc;
  }

  rc = sqlite3_step(pStmt);
  // No rows? Then we're a fresh DB with the min starting version
  if (rc == SQLITE_DONE)
  {
    dbVersionSet = 1;
    sqlite3_finalize(pStmt);
    return rc;
  }

  // error condition
  if (rc != SQLITE_ROW)
  {
    sqlite3_finalize(pStmt);
    return rc;
  }

  // had a row? grab the version returned to us
  // columns are 0 indexed.
  int type = sqlite3_column_type(pStmt, 0);
  if (type == SQLITE_NULL)
  {
    // No rows. Keep the initial version.
    dbVersionSet = 1;
    sqlite3_finalize(pStmt);
    return SQLITE_OK;
  }

  // dbVersion is last version written but we always call `nextDbVersion` before writing
  // a dbversion. Hence no +1.
  dbVersion = sqlite3_column_int64(pStmt, 0);
  dbVersionSet = 1;
  sqlite3_finalize(pStmt);

  return SQLITE_OK;
}

/**
 * return the uuid which uniquely identifies this database.
 *
 * `select cfsql_siteid()`
 *
 * @param context
 * @param argc
 * @param argv
 */
static void siteIdFunc(sqlite3_context *context, int argc, sqlite3_value **argv)
{
  sqlite3_result_blob(context, &siteIdBlob, siteIdBlobSize, SQLITE_STATIC);
}

/**
 * Return the current version of the database.
 *
 * `select cfsql_dbversion()`
 */
static void dbVersionFunc(sqlite3_context *context, int argc, sqlite3_value **argv)
{
  sqlite3_result_int64(context, dbVersion);
}

/**
 * Return the next version of the database for use in inserts/updates/deletes
 *
 * `select cfsql_nextdbversion()`
 */
static void nextDbVersionFunc(sqlite3_context *context, int argc, sqlite3_value **argv)
{
  // dbVersion is an atomic int thus `++dbVersion` is a CAS and will always return
  // a unique version for the given invocation, even under concurrent accesses.
  sqlite3_result_int64(context, ++dbVersion);
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
int cfsql_createClockTable(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
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
  zSql = sqlite3_mprintf("DROP TABLE IF EXISTS \"%s__cfsql_clock\"", tableInfo->tblName);
  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);
  if (rc != SQLITE_OK) {
    return rc;
  }

  // TODO: just forbid tables w/o primary keys?
  if (tableInfo->pksLen == 0)
  {
    zSql = sqlite3_mprintf("CREATE TABLE \"%s__cfsql_clock\" (\
      \"rowid\" NOT NULL,\
      \"__cfsql_col_num\" NOT NULL,\
      \"__cfsql_version\" NOT NULL,\
      \"__cfsql_site_id\" NOT NULL,\
      PRIMARY KEY (\"rowid\", \"__cfsql_col_num\")\
    )",
                           tableInfo->tblName);
  }
  else
  {
    pkList = cfsql_asIdentifierList(
        tableInfo->pks,
        tableInfo->pksLen,
        0);
    zSql = sqlite3_mprintf("CREATE TABLE \"%s__cfsql_clock\" (\
      %s,\
      \"__cfsql_col_num\" NOT NULL,\
      \"__cfsql_version\" NOT NULL,\
      \"__cfsql_site_id\" NOT NULL,\
      PRIMARY KEY (%s, __cfsql_col_num)\
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
      "CREATE INDEX \"%s__cfsql_clock_v_idx\" ON \"%s__cfsql_clock\" (__cfsql_version)",
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
  char *zSql = 0;
  cfsql_TableInfo *tableInfo = 0;

  rc = cfsql_getTableInfo(
      db,
      USER_SPACE,
      tblName,
      &tableInfo,
      err);

  if (rc != SQLITE_OK)
  {
    cfsql_freeTableInfo(tableInfo);
    return rc;
  }

  rc = cfsql_createClockTable(db, tableInfo, err);
  if (rc == SQLITE_OK)
  {
    rc = cfsql_createCrrTriggers(db, tableInfo, err);
  }

  cfsql_freeTableInfo(tableInfo);
  return rc;
}

static int dropCrr(
    sqlite3_context *context,
    sqlite3 *db,
    const char *schemaName,
    const char *tblName,
    char **err)
{
  char *zSql = 0;
  int rc = SQLITE_OK;

  zSql = sqlite3_mprintf("DROP TABLE IF EXISTS \"%s\".\"%s\"", schemaName, tblName);
  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);
  if (rc != SQLITE_OK)
  {
    return rc;
  }

  zSql = sqlite3_mprintf("DROP TABLE \"%s\".\"%s\"__cfsql_clock", schemaName, tblName);
  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);
  if (rc != SQLITE_OK)
  {
    return rc;
  }

  return rc;
}

/**
 * Takes a table name and turns it into a CRR.
 *
 * This allows users to create and modify tables as normal.
 */
static void cfsqlMakeCrrFunc(sqlite3_context *context, int argc, sqlite3_value **argv)
{
  const char *tblName = 0;
  const char *schemaName = 0;
  int rc = SQLITE_OK;
  char *found = 0;
  sqlite3 *db = sqlite3_context_db_handle(context);
  char *errmsg = 0;

  if (argc == 0) {
    sqlite3_result_error(context, "Wrong number of args provided to cfsql_as_crr. Provide the schema name and table name or just the table name.", -1);
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

  // TODO: likely need this to be a sub-transaction
  rc = sqlite3_exec(db, "BEGIN", 0, 0, &errmsg);
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
    sqlite3_exec(db, "ROLLBACK", 0, 0, 0);
    return;
  }

  sqlite3_exec(db, "COMMIT", 0, 0, 0);
}

// TODO: install a commit_hook to advance the dbversion on every tx commit
// get_changes_since function

#ifdef _WIN32
__declspec(dllexport)
#endif
    int sqlite3_cfsqlite_preinit()
{
#if SQLITE_THREADSAFE != 0
  if (globalsInitMutex == 0)
  {
    globalsInitMutex = sqlite3_mutex_alloc(SQLITE_MUTEX_FAST);
  }
#endif
  return SQLITE_OK;
}

static int initSharedMemory(sqlite3 *db)
{
// TODO if we were used as a run time loadable extension rather than
// statically linked, the mutex will not exist.
#if SQLITE_THREADSAFE != 0
  sqlite3_mutex_enter(globalsInitMutex);
#endif

  int rc = SQLITE_OK;
  if (sharedMemoryInitialized != 0)
  {
    return rc;
  }

  /**
   * Initialization creates a number of tables.
   * We should ensure we do these in a tx
   * so we cannot have partial initialization.
   */
  rc = sqlite3_exec(db, "BEGIN", 0, 0, 0);

  if (rc == SQLITE_OK)
  {
    rc = initSiteId(db);
  }

  if (rc == SQLITE_OK)
  {
    // once site id is initialize, we are able to init db version.
    // db version uses site id in its queries hence why it comes after site id init.
    rc = initDbVersion(db);
  }

  if (rc == SQLITE_OK)
  {
    rc = sqlite3_exec(db, "COMMIT", 0, 0, 0);
  }
  else
  {
    // Intentionally not setting the RC.
    // We already have a failure and do not want to record rollback success.
    sqlite3_exec(db, "ROLLBACK", 0, 0, 0);
  }

  if (rc == SQLITE_OK)
  {
    sharedMemoryInitialized = 1;
  }

#if SQLITE_THREADSAFE != 0
  sqlite3_mutex_leave(globalsInitMutex);
#endif
  return rc;
}

#ifdef _WIN32
__declspec(dllexport)
#endif
    int sqlite3_cfsqlite_init(sqlite3 *db, char **pzErrMsg,
                              const sqlite3_api_routines *pApi)
{
  int rc = SQLITE_OK;

  SQLITE_EXTENSION_INIT2(pApi);

  // If this is used as a runtime loadable extension
  // then preinit might not have been run.
  sqlite3_cfsqlite_preinit();

  rc = initSharedMemory(db);
  if (rc == SQLITE_OK)
  {
    rc = sqlite3_create_function(db, "cfsql_siteid", 0,
                                 // siteid never changes -- deterministic and innnocuous
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS |
                                     SQLITE_DETERMINISTIC,
                                 0, siteIdFunc, 0, 0);
  }
  if (rc == SQLITE_OK)
  {
    rc = sqlite3_create_function(db, "cfsql_dbversion", 0,
                                 // dbversion can change on each invocation.
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS,
                                 0, dbVersionFunc, 0, 0);
  }
  if (rc == SQLITE_OK)
  {
    rc = sqlite3_create_function(db, "cfsql_nextdbversion", 0,
                                 // dbversion can change on each invocation.
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS,
                                 0, nextDbVersionFunc, 0, 0);
  }

  if (rc == SQLITE_OK)
  {
    // Only register a commit hook, not update or pre-update, since all rows in the same transaction
    // should have the same clock value.
    // This allows us to replicate them together and ensure more consistency.
    rc = sqlite3_create_function(db, "cfsql_as_crr", -1,
                                 // cfsql should only ever be used at the top level
                                 // and does a great deal to modify
                                 // existing database state. directonly.
                                 SQLITE_UTF8 | SQLITE_DIRECTONLY,
                                 0, cfsqlMakeCrrFunc, 0, 0);
  }

  // cfsql_changes_since(asking_peer, version, rowid?)

  // if (rc == SQLITE_OK) {
  //   sqlite3_commit_hook(db, commitHook, 0);
  // }

  return rc;
}