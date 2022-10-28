#include "crsqlite.h"
SQLITE_EXTENSION_INIT1

#include "util.h"
#include "tableinfo.h"
#include "consts.h"
#include "triggers.h"
#include "changes-vtab.h"

#include <ctype.h>
#include <stdint.h>
#include <string.h>
#include <limits.h>
#include <assert.h>
#include <stdatomic.h>

/**
 * Per-db global variables to hold the site id and db version.
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
#define PER_DB_DATA_BUFFER_LEN 50
static crsql_PerDbData allPerDbData[PER_DB_DATA_BUFFER_LEN];

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
 * Computes the current version of the database
 * and saves it in the global variable.
 * The version is incremented on every transaction commit.
 * The version is used on every write to update clock values for the
 * rows written.
 *
 * INIT DB VERSION MUST BE CALLED AFTER SITE ID INITIALIZATION
 */
static int initDbVersion(sqlite3 *db, sqlite3_int64 *dbVersion)
{
  char *zSql;
  sqlite3_stmt *pStmt = 0;
  int rc = SQLITE_OK;
  char **rClockTableNames = 0;
  int rNumRows = 0;
  int rNumCols = 0;
  int i = 0;
  *dbVersion = 0;

  // find all `clock` tables
  rc = sqlite3_get_table(
      db,
      CLOCK_TABLES_SELECT,
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
    sqlite3_free_table(rClockTableNames);
    return rc;
  }

  // builds the query string
  zSql = crsql_getDbVersionUnionQuery(rNumRows, rClockTableNames);
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
    sqlite3_finalize(pStmt);
    return SQLITE_OK;
  }

  // dbVersion is last version written but we always call `nextDbVersion` before writing
  // a dbversion. Hence no +1.
  *dbVersion = sqlite3_column_int64(pStmt, 0);
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
  crsql_PerDbData *data = (crsql_PerDbData *)sqlite3_user_data(context);
  sqlite3_result_blob(context, data->siteId, SITE_ID_LEN, SQLITE_STATIC);
}

/**
 * Return the current version of the database.
 *
 * `select crsql_dbversion()`
 */
static void dbVersionFunc(sqlite3_context *context, int argc, sqlite3_value **argv)
{
  crsql_PerDbData *data = (crsql_PerDbData *)sqlite3_user_data(context);
  sqlite3_result_int64(context, data->dbVersion);
}

/**
 * Return the next version of the database for use in inserts/updates/deletes
 *
 * `select crsql_nextdbversion()`
 */
static void nextDbVersionFunc(sqlite3_context *context, int argc, sqlite3_value **argv)
{
  // dbVersion is an atomic int thus `++dbVersion` is a CAS and will always return
  // a unique version for the given invocation, even under concurrent accesses.
  crsql_PerDbData *data = (crsql_PerDbData *)sqlite3_user_data(context);
  sqlite3_result_int64(context, ++(data->dbVersion));
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
  zSql = sqlite3_mprintf("DROP TABLE IF EXISTS \"%s__crsql_clock\"", tableInfo->tblName);
  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);
  if (rc != SQLITE_OK)
  {
    return rc;
  }

  // TODO: just forbid tables w/o primary keys?
  if (tableInfo->pksLen == 0)
  {
    zSql = sqlite3_mprintf("CREATE TABLE \"%s__crsql_clock\" (\
      \"rowid\" NOT NULL,\
      \"__crsql_col_num\" NOT NULL,\
      \"__crsql_version\" NOT NULL,\
      \"__crsql_site_id\" NOT NULL,\
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
    zSql = sqlite3_mprintf("CREATE TABLE \"%s__crsql_clock\" (\
      %s,\
      \"__crsql_col_num\" NOT NULL,\
      \"__crsql_version\" NOT NULL,\
      \"__crsql_site_id\" NOT NULL,\
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
      "CREATE INDEX \"%s__crsql_clock_v_idx\" ON \"%s__crsql_clock\" (__crsql_version)",
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
    rc = crsql_createCrrTriggers(db, tableInfo, err);
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
  char *found = 0;
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

#ifdef _WIN32
__declspec(dllexport)
#endif
    int sqlite3_crsqlite_preinit()
{
  // TODO: document that if this extension is used as a run time loadable extension
  // then one thread must initialize it before any other threads may be allowed to
  // start using it.
  // If it is statically linked as an auto-load extension then the user is ok to do anything.
#if SQLITE_THREADSAFE != 0
  if (globalsInitMutex == 0)
  {
    globalsInitMutex = sqlite3_mutex_alloc(SQLITE_MUTEX_FAST);
  }
#endif
  return SQLITE_OK;
}

static void initSharedMemory(sqlite3 *db)
{
#if SQLITE_THREADSAFE != 0
  sqlite3_mutex_enter(globalsInitMutex);
#endif

  if (sharedMemoryInitialized == 0)
  {
    memset(allPerDbData, 0, sizeof(allPerDbData));
    sharedMemoryInitialized = 1;
  }

#if SQLITE_THREADSAFE != 0
  sqlite3_mutex_leave(globalsInitMutex);
#endif
}

crsql_PerDbData *findPerDbData(unsigned char *siteId)
{
  for (int i = 0; i < PER_DB_DATA_BUFFER_LEN; ++i)
  {
    if (allPerDbData[i].siteId == 0) {
      continue;
    }
    
    if (crsql_siteIdCmp(allPerDbData[i].siteId, SITE_ID_LEN, siteId, SITE_ID_LEN) == 0)
    {
      return &allPerDbData[i];
    }
  }

  return 0;
}

crsql_PerDbData *getUnusedPerDbData()
{
  for (int i = 0; i < PER_DB_DATA_BUFFER_LEN; ++i)
  {
    if (allPerDbData[i].referenceCount == 0)
    {
      return &allPerDbData[i];
    }
  }

  return 0;
}

static void returnPerDbData(void *d)
{
  crsql_PerDbData *data = (crsql_PerDbData *)d;
  data->referenceCount -= 1;
  if (data->referenceCount < 0) {
    // TODO: log. inidcative of a bug if this happens.
    data->referenceCount = 0;
  }
}

// TODO: we need to register destructor(s)
// to tear down perdb data when extension unloads
static int createOrGetPerDbData(sqlite3 *db, crsql_PerDbData **ppOut)
{
#if SQLITE_THREADSAFE != 0
  sqlite3_mutex_enter(globalsInitMutex);
#endif

  /**
   * Initialization creates a number of tables.
   * We should ensure we do these in a tx
   * so we cannot have partial initialization.
   */
  int rc = sqlite3_exec(db, "BEGIN", 0, 0, 0);
  unsigned char *siteId = sqlite3_malloc(SITE_ID_LEN * sizeof *siteId);
  sqlite3_int64 dbVersion = 0;

  if (rc == SQLITE_OK)
  {
    rc = initSiteId(db, siteId);
  }

  int bAssignedPerDbData = 0;
  if (rc == SQLITE_OK)
  {
    // now look in our list of perDbData for already initialized data
    // for this db.
    crsql_PerDbData *existing = findPerDbData(siteId);
    if (existing != 0)
    {
      *ppOut = existing;
      (*ppOut)->referenceCount += 1;
      bAssignedPerDbData = 1;
      sqlite3_free(siteId);
      siteId = 0;
    }
  }

  if (rc == SQLITE_OK && bAssignedPerDbData == 0)
  {
    // once site id is initialize, we are able to init db version.
    // db version uses site id in its queries hence why it comes after site id init.
    rc = initDbVersion(db, &dbVersion);

    if (rc == SQLITE_OK)
    {
      // grab an unallocated slot in our db data
      crsql_PerDbData *empty = getUnusedPerDbData();
      if (empty == 0)
      {
        rc = SQLITE_ERROR;
      }
      else
      {
        *ppOut = empty;
        empty->dbVersion = dbVersion;

        // we are reclaiming someone's slot. free their siteid.
        unsigned char * priorSiteId = empty->siteId;
        sqlite3_free(priorSiteId);

        empty->siteId = siteId;
        empty->referenceCount = 1;
      }
    }
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
    sqlite3_free(siteId);
  }

#if SQLITE_THREADSAFE != 0
  sqlite3_mutex_leave(globalsInitMutex);
#endif

  return rc;
}

#ifdef _WIN32
__declspec(dllexport)
#endif
    int sqlite3_crsqlite_init(sqlite3 *db, char **pzErrMsg,
                              const sqlite3_api_routines *pApi)
{
  int rc = SQLITE_OK;

  SQLITE_EXTENSION_INIT2(pApi);

  // If this is used as a runtime loadable extension
  // then preinit might not have been run.
  sqlite3_crsqlite_preinit();

  // shared memory will return to us the memory for the given
  // database.
  // we should thus then set that into our `userdata`
  // for our functions and extensions
  initSharedMemory(db);

  crsql_PerDbData *perDbData = 0;
  rc = createOrGetPerDbData(db, &perDbData);

  if (rc == SQLITE_OK)
  {
    rc = sqlite3_create_function(db, "crsql_siteid", 0,
                                 // siteid never changes -- deterministic and innnocuous
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS |
                                     SQLITE_DETERMINISTIC,
                                 perDbData, siteIdFunc, 0, 0);
  }
  if (rc == SQLITE_OK)
  {
    rc = sqlite3_create_function(db, "crsql_dbversion", 0,
                                 // dbversion can change on each invocation.
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS,
                                 perDbData, dbVersionFunc, 0, 0);
  }
  if (rc == SQLITE_OK)
  {
    rc = sqlite3_create_function(db, "crsql_nextdbversion", 0,
                                 // dbversion can change on each invocation.
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS,
                                 perDbData, nextDbVersionFunc, 0, 0);
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
        perDbData,
        returnPerDbData);
  }

  if (rc != SQLITE_OK && perDbData != 0)
  {
    perDbData->referenceCount -= 1;
  }

  return rc;
}