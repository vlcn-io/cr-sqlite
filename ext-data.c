#include "ext-data.h"
#include "consts.h"
#include "util.h"

crsql_ExtData *crsql_newExtData(sqlite3 *db)
{
  crsql_ExtData *pExtData = sqlite3_malloc(sizeof *pExtData);

  pExtData->pPragmaSchemaVersionStmt = 0;
  int rc = sqlite3_prepare_v3(db, "PRAGMA schema_version", -1, SQLITE_PREPARE_PERSISTENT, &(pExtData->pPragmaSchemaVersionStmt), 0);
  if (rc != SQLITE_OK) {
    sqlite3_finalize(pExtData->pPragmaSchemaVersionStmt);
    return 0;
  }

  pExtData->dbVersion = -1;
  pExtData->pragmaSchemaVersion = -1;
  pExtData->siteId = sqlite3_malloc(SITE_ID_LEN * sizeof *(pExtData->siteId));
  pExtData->pDbVersionStmt = 0;
  pExtData->zpTableInfos = 0;

  return pExtData;
}

void crsql_freeExtData(crsql_ExtData *pExtData)
{
  sqlite3_free(pExtData->siteId);
  sqlite3_finalize(pExtData->pDbVersionStmt);
  sqlite3_finalize(pExtData->pPragmaSchemaVersionStmt);
  sqlite3_free(pExtData);
}

// Should _only_ be called when disconnecting from the db
// for some reason finalization in extension unload methods doesn't
// work as expected
// see https://sqlite.org/forum/forumpost/c94f943821
void crsql_finalize(crsql_ExtData *pExtData) {
  sqlite3_finalize(pExtData->pDbVersionStmt);
  sqlite3_finalize(pExtData->pPragmaSchemaVersionStmt);
  pExtData->pDbVersionStmt = 0;
  pExtData->pPragmaSchemaVersionStmt = 0;
}

int crsql_fetchPragmaSchemaVersion(sqlite3 *db, crsql_ExtData *pExtData)
{
  int rc = sqlite3_step(pExtData->pPragmaSchemaVersionStmt);
  if (rc == SQLITE_ROW)
  {
    int version = sqlite3_column_int(pExtData->pPragmaSchemaVersionStmt, 0);
    sqlite3_reset(pExtData->pPragmaSchemaVersionStmt);
    if (version > pExtData->pragmaSchemaVersion)
    {
      pExtData->pragmaSchemaVersion = version;
      return 1;
    }

    return 0;
  } else {
    sqlite3_reset(pExtData->pPragmaSchemaVersionStmt);
  }

  return -1;
}

int crsql_recreateDbVersionStmt(sqlite3 *db, crsql_ExtData *pExtData)
{
  char *zSql = 0;
  char **rClockTableNames = 0;
  int rNumRows = 0;
  int rNumCols = 0;
  int rc = SQLITE_OK;

  sqlite3_finalize(pExtData->pDbVersionStmt);
  pExtData->pDbVersionStmt = 0;

  sqlite3_get_table(
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
    return -1;
  }

  zSql = crsql_getDbVersionUnionQuery(rNumRows, rClockTableNames);
  sqlite3_free_table(rClockTableNames);

  rc = sqlite3_prepare_v3(db, zSql, -1, SQLITE_PREPARE_PERSISTENT, &(pExtData->pDbVersionStmt), 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK) {
    sqlite3_finalize(pExtData->pDbVersionStmt);
  }

  return rc;
}

int crsql_fetchDbVersionFromStorage(sqlite3 *db, crsql_ExtData *pExtData) {
  int rc = SQLITE_OK;

  // version was not cached
  // check if the schema changed and rebuild version stmt if so
  int bSchemaChanged = crsql_fetchPragmaSchemaVersion(db, pExtData);
  if (bSchemaChanged < 0)
  {
    return SQLITE_ERROR;
  }

  if (bSchemaChanged > 0)
  {
    rc = crsql_recreateDbVersionStmt(db, pExtData);
    if (rc == -1) {
      // this means there are no clock tables / this is a clean db
      pExtData->dbVersion = MIN_POSSIBLE_DB_VERSION;
      return SQLITE_OK;
    }
    if (rc != SQLITE_OK)
    {
      return rc;
    }
  }

  rc = sqlite3_step(pExtData->pDbVersionStmt);
  // no rows? We're a fresh db with the min starting version
  if (rc == SQLITE_DONE) {
    rc = sqlite3_reset(pExtData->pDbVersionStmt);
    pExtData->dbVersion = MIN_POSSIBLE_DB_VERSION;
    return rc;
  }

  if (rc != SQLITE_ROW) {
    sqlite3_reset(pExtData->pDbVersionStmt);
    return SQLITE_ERROR;
  }

  int type = sqlite3_column_type(pExtData->pDbVersionStmt, 0);
  if (type == SQLITE_NULL) {
    // No rows? We're at min version
    rc = sqlite3_reset(pExtData->pDbVersionStmt);
    pExtData->dbVersion = MIN_POSSIBLE_DB_VERSION;
    return rc;
  }

  pExtData->dbVersion = sqlite3_column_int64(pExtData->pDbVersionStmt, 0);
  return sqlite3_reset(pExtData->pDbVersionStmt);
}

int crsql_getDbVersion(sqlite3 *db, crsql_ExtData *pExtData)
{
  int rc = SQLITE_OK;

  // version is cached. We clear the cached version
  // at the end of each transaction so it is safe to return this
  // without checking the schema version.
  // It is an error to use crsqlite in such a way that you modify
  // a schema and fetch changes in the same transaction.
  if (pExtData->dbVersion != -1)
  {
    return SQLITE_OK;
  }

  rc = crsql_fetchDbVersionFromStorage(db, pExtData);
  return rc;
}

// TODO: a `getAllTableInfo` that checks against `pExtData`