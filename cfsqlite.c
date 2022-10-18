#include "cfsqlite.h"
SQLITE_EXTENSION_INIT1

#include "util.h"
#include "tableinfo.h"
#include "consts.h"
#include "triggers.h"
#include "queryinfo.h"

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

  for (i = 0; i < rNumRows; ++i)
  {
    // SQLITE_STATIC since the site id never changes.
    // binds are 1 indexed
    rc += sqlite3_bind_blob(pStmt, i + 1, siteIdBlob, siteIdBlobSize, SQLITE_STATIC);
  }
  if (rc != SQLITE_OK) {
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
  if (rc != SQLITE_ROW) {
    sqlite3_finalize(pStmt);
    return rc;
  }

  // had a row? grab the version returned to us
  // columns are 0 indexed.
  int type = sqlite3_column_type(pStmt, 0);
  if (type == SQLITE_NULL) {
    // No rows. Keep the initial version.
    dbVersionSet = 1;
    sqlite3_finalize(pStmt);
    return SQLITE_OK;
  }
  
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
 * The clock table holds the snapshot
 * of the vector clock at the time there was
 * a mutation for a given row.
 *
 * The clock table is structured as a junction table.
 * | rowid | site_id | version
 * +--------+---------+--------
 *   1          a         1
 *   1          b         2
 * ----------------------------
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

  if (tableInfo->pksLen == 0)
  {
    // We never select the clock for a single row by itself
    // hence that rowid is second in the pk def.
    zSql = sqlite3_mprintf("CREATE TABLE \"%s__cfsql_clock\" (\
      \"rowid\" NOT NULL,\
      \"__cfsql_site_id\" NOT NULL,\
      \"__cfsql_version\" NOT NULL,\
      PRIMARY KEY (\"__cfsql_site_id\", \"rowid\")\
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
      \"__cfsql_site_id\" NOT NULL,\
      \"__cfsql_version\" NOT NULL,\
      PRIMARY KEY (\"__cfsql_site_id\", %s)\
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

  return rc;
}

int cfsql_addIndicesToCrrBaseTable(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err)
{
  int rc = SQLITE_OK;
  cfsql_IndexInfo *indexInfo = tableInfo->indexInfo;
  int indexInfoLen = tableInfo->indexInfoLen;
  char *identifierList;
  char *zSql;

  if (indexInfoLen == 0)
  {
    return rc;
  }

  for (int i = 0; i < indexInfoLen; ++i)
  {
    int isPk = strcmp(indexInfo[i].origin, "pk") == 0;
    if (isPk)
    {
      // we create primary keys in the table creation statement
      continue;
    }

    // TODO: we don't yet handle indices created with where clauses
    identifierList = cfsql_asIdentifierListStr(indexInfo[i].indexedCols, indexInfo[i].indexedColsLen, ',');
    zSql = sqlite3_mprintf(
        "CREATE INDEX \"%s\" ON \"%s__cfsql_crr\" (%s)",
        indexInfo[i].name,
        tableInfo->tblName,
        identifierList);
    sqlite3_free(identifierList);

    rc = sqlite3_exec(db, zSql, 0, 0, err);
    sqlite3_free(zSql);
    if (rc != SQLITE_OK)
    {
      return rc;
    }
  }

  return SQLITE_OK;
}

char *cfsql_getCreateCrrBaseTableQuery(cfsql_TableInfo *tableInfo)
{
  char *columnDefs = cfsql_asColumnDefinitions(
      tableInfo->withVersionCols,
      tableInfo->withVersionColsLen);
  char *pkList = cfsql_asIdentifierList(
      tableInfo->pks,
      tableInfo->pksLen,
      0);
  char *ret = sqlite3_mprintf("CREATE TABLE \"%s__cfsql_crr\" (\
    %s,\
    __cfsql_cl INT DEFAULT 1,\
    __cfsql_src INT DEFAULT 0%s\
    %s %s %s %s\
  )",
                              tableInfo->tblName,
                              columnDefs,
                              pkList != 0 ? "," : 0,
                              pkList != 0 ? "PRIMARY KEY" : 0,
                              pkList != 0 ? "(" : 0,
                              pkList,
                              pkList != 0 ? ")" : 0);

  sqlite3_free(pkList);
  sqlite3_free(columnDefs);
  return ret;
}

int cfsql_createCrrBaseTable(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err)
{
  int rc = SQLITE_OK;
  char *zSql = 0;
  sqlite3_stmt *pStmt = 0;

  zSql = cfsql_getCreateCrrBaseTableQuery(tableInfo);

  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    return rc;
  }

  if (rc != SQLITE_OK)
  {
    return rc;
  }

  // We actually never need to do this.
  // Unless we're migrating existing tables.
  // rc = cfsql_addIndicesToCrrBaseTable(
  //     db,
  //     tableInfo,
  //     err);
  // if (rc != SQLITE_OK)
  // {
  //   return rc;
  // }

  return SQLITE_OK;
}

void cfsql_insertConflictResolution()
{
}

/**
 * The patch view provides an interface for applying patches
 * to a crr.
 *
 * I.e., inserts can be made
 * against the patch view to sync data from
 * a peer.
 */
int cfsql_createPatchView(
    sqlite3 *db,
    cfsql_TableInfo *tableInfo,
    char **err)
{
  char *zSql = 0;
  int rc = SQLITE_OK;

  zSql = sqlite3_mprintf("CREATE VIEW \"%s__cfsql_patch\" AS SELECT\
    \"%s__cfsql_crr\".*,\
    '{\"fake\": 1}' as __cfsql_clock\
  FROM \"%s__cfsql_crr\"",
                         tableInfo->tblName,
                         tableInfo->tblName,
                         tableInfo->tblName);

  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);
  return rc;
}

/**
 * Create a new crr --
 * all triggers, views, tables
 */
static void createCrr(
    sqlite3_context *context,
    sqlite3 *db,
    cfsql_QueryInfo *query)
{
  int rc = SQLITE_OK;
  char *zSql = 0;
  char *err = 0;
  cfsql_TableInfo *tableInfo = 0;

  rc = sqlite3_exec(db, query->origQuery, 0, 0, &err);

  if (rc != SQLITE_OK)
  {
    sqlite3_result_error(context, err, -1);
    sqlite3_free(err);
    return;
  }

  rc = cfsql_getTableInfo(
      db,
      USER_SPACE,
      query->tblName,
      &tableInfo,
      &err);

  if (rc != SQLITE_OK)
  {
    sqlite3_result_error(context, err, -1);
    sqlite3_free(err);
    cfsql_freeTableInfo(tableInfo);
    return;
  }

  tableInfo->tblName = strdup(query->tblName);

  rc = cfsql_createClockTable(db, tableInfo, &err);
  if (rc == SQLITE_OK)
  {
    rc = cfsql_createCrrBaseTable(db, tableInfo, &err);
  }
  if (rc == SQLITE_OK)
  {
    rc = cfsql_createPatchView(db, tableInfo, &err);
  }
  if (rc == SQLITE_OK)
  {
    rc = cfsql_createCrrViewTriggers(db, tableInfo, &err);
  }
  if (rc == SQLITE_OK)
  {
    rc = cfsql_createPatchTrigger(db, tableInfo, &err);
  }
  if (rc == SQLITE_OK)
  {
    cfsql_freeTableInfo(tableInfo);
    return;
  }

  sqlite3_result_error(context, err, -1);
  sqlite3_free(err);
}

static int dropCrr(
    sqlite3_context *context,
    sqlite3 *db,
    cfsql_QueryInfo *query,
    char **err)
{
  char *zSql = 0;
  int rc = SQLITE_OK;

  zSql = sqlite3_mprintf("DROP TABLE \"%s\".\"%s\"", query->schemaName, query->tblName);
  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);
  if (rc != SQLITE_OK)
  {
    return rc;
  }

  zSql = sqlite3_mprintf("DROP TABLE \"%s\".\"%s\"__cfsql_clock", query->schemaName, query->tblName);
  rc = sqlite3_exec(db, zSql, 0, 0, err);
  sqlite3_free(zSql);
  if (rc != SQLITE_OK)
  {
    return rc;
  }

  return rc;
}

char *cfsql_getCreateCrrIndexQuery(
    cfsql_QueryInfo *query)
{
  return sqlite3_mprintf("%s \"%s\".\"%s__cfsql_crr\" %s",
                         query->prefix,
                         query->schemaName,
                         query->tblName,
                         query->suffix);
}

static int createCrrIndex(
    sqlite3_context *context,
    sqlite3 *db,
    cfsql_QueryInfo *query,
    char **err)
{
  int rc = SQLITE_OK;
  // https://www.sqlite.org/lang_createindex.html
  char *newQuery = cfsql_getCreateCrrIndexQuery(query);

  if (newQuery == 0)
  {
    *err = strdup("Missing `ON` in create index statement");
    return SQLITE_ERROR;
  }

  rc = sqlite3_exec(db, newQuery, 0, 0, err);
  sqlite3_free(newQuery);

  return rc;
}

static int dropCrrIndex(
    sqlite3_context *context,
    sqlite3 *db,
    cfsql_QueryInfo *query,
    char **err)
{
  return sqlite3_exec(db, query->reformedQuery, 0, 0, err);
}

static void alterCrr()
{
  // create crr in tmp table
  // run alter againt tmp crr
  // diff pragma of orig crr and tmp crr
  // determine:
  // - col add
  // - col drop
  // - col rename
  // add: +1
  // rm: -1
  // rename: delta on one
  //
  // rename:
  // drop triggers and views
  // rename col on base crr (and version col.. if need be)
  // recreate triggers and views based on new crr pragma
  //
  // add:
  // same as above but add col on step 2
  //
  // remove:
  // remove col on step 2
}

/**
 * Takes a table name and turns it into a CRR.
 * 
 * This allows users to create and modify tables as normal.
 */
static void cfsqlMakeCrrFunc(sqlite3_context *context, int argc, sqlite3_value **argv)
{
  const char *tblName = 0;
  int rc = SQLITE_OK;
  char *found = 0;
  int queryType = -1;
  sqlite3 *db = sqlite3_context_db_handle(context);
  char *errmsg = 0;
  char *normalized = 0;

  tblName = (const char *)sqlite3_value_text(argv[0]);

  // TODO: likely need this to be a sub-transaction
  rc = sqlite3_exec(db, "BEGIN", 0, 0, &errmsg);
  if (rc != SQLITE_OK)
  {
    sqlite3_result_error(context, errmsg, -1);
    sqlite3_free(errmsg);
    sqlite3_free(normalized);
    return;
  }

  // TODO: pass and use errmsg, check return codes
  // switch (queryInfo->type)
  // {
  // case CREATE_TABLE:
  //   createCrr(context, db, queryInfo);
  //   break;
  // case DROP_TABLE:
  //   dropCrr(context, db, queryInfo, &errmsg);
  //   break;
  // case CREATE_INDEX:
  //   createCrrIndex(context, db, queryInfo, &errmsg);
  //   break;
  // case DROP_INDEX:
  //   dropCrrIndex(context, db, queryInfo, &errmsg);
  //   break;
  // case ALTER_TABLE:
  //   alterCrr();
  //   break;
  // default:
  //   break;
  // }

  sqlite3_exec(db, "COMMIT", 0, 0, 0);
}

// TODO: install a commit_hook to advance the dbversion on every tx commit
// get_changes_since function
// vector_short -- centralized resolver(s)

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
    rc = sqlite3_create_function(db, "cfsql_make_crr", 1,
                                 // cfsql should only ever be used at the top level
                                 // and does a great deal to modify
                                 // existing database state. directonly.
                                 SQLITE_UTF8 | SQLITE_DIRECTONLY,
                                 0, cfsqlMakeCrrFunc, 0, 0);
  }

  return rc;
}