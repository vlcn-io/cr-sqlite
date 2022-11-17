#include "crsqlite.h"
#include "ext-data.h"
#include "consts.h"
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

#ifndef CHECK_OK
#define CHECK_OK       \
  if (rc != SQLITE_OK) \
  {                    \
    goto fail;         \
  }
#endif

static void textNewExtData() {
  sqlite3 *db;
  int rc;
  rc = sqlite3_open(":memory:", &db);
  crsql_ExtData* pExtData = crsql_newExtData(db);

  assert(pExtData->dbVersion == -1);
  // statement used to determine schema version
  assert(pExtData->pPragmaSchemaVersionStmt != 0);
  // last schema version fetched -- none so -1
  assert(pExtData->pragmaSchemaVersion == -1);
  // same as above
  assert(pExtData->pragmaSchemaVersionForTableInfos == -1);
  // set in initSiteId
  assert(pExtData->siteId != 0);
  // no db version extraction yet
  assert(pExtData->pDbVersionStmt == 0);
  // no table info allocation yet
  assert(pExtData->zpTableInfos == 0);
  assert(pExtData->tableInfosLen == 0);

  // ext data is freed on db close.
  sqlite3_close(db);
}

static void testFreeExtData() {
  printf("FreeExtData\n");
  sqlite3 *db;
  int rc;
  rc = sqlite3_open(":memory:", &db);
  crsql_ExtData* pExtData = crsql_newExtData(db);
  // ext data is freed on db close.
  crsql_finalize(pExtData);
  sqlite3_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testFinalize() {
  printf("FinalizeExtData\n");
  sqlite3 *db;
  int rc;
  rc = sqlite3_open(":memory:", &db);
  crsql_ExtData* pExtData = crsql_newExtData(db);

  crsql_finalize(pExtData);
  assert(pExtData->pDbVersionStmt == 0);
  assert(pExtData->pPragmaSchemaVersionStmt == 0);

  // finalizing twice should be a no-op
  crsql_finalize(pExtData);
  sqlite3_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testFetchPragmaSchemaVersion() {
  printf("FetchPragmaSchemaVersion\n");
  sqlite3 *db;
  int rc;
  int didChange = 0;
  rc = sqlite3_open(":memory:", &db);
  crsql_ExtData* pExtData = crsql_newExtData(db);

  // fetch the schema info for db version update
  didChange = crsql_fetchPragmaSchemaVersion(db, pExtData, 0);
  assert(pExtData->pragmaSchemaVersion != -1);
  assert(didChange == 1);

  // fetch the schema info for table info
  didChange = crsql_fetchPragmaSchemaVersion(db, pExtData, 1);
  assert(didChange == 1);
  assert(pExtData->pragmaSchemaVersionForTableInfos != -1);

  // re-fetch both with no schema change, should be same value
  int oldVersion = pExtData->pragmaSchemaVersion;
  didChange = crsql_fetchPragmaSchemaVersion(db, pExtData, 0);
  assert(oldVersion == pExtData->pragmaSchemaVersion);
  assert(didChange == 0);

  oldVersion = pExtData->pragmaSchemaVersionForTableInfos;
  didChange = crsql_fetchPragmaSchemaVersion(db, pExtData, 1);
  assert(oldVersion == pExtData->pragmaSchemaVersionForTableInfos);
  assert(didChange == 0);

  // now make a schema modification
  sqlite3_exec(db, "CREATE TABLE foo (a)", 0, 0, 0);
  oldVersion = pExtData->pragmaSchemaVersion;
  didChange = crsql_fetchPragmaSchemaVersion(db, pExtData, 0);
  assert(oldVersion != pExtData->pragmaSchemaVersion);
  assert(didChange == 1);

  oldVersion = pExtData->pragmaSchemaVersionForTableInfos;
  didChange = crsql_fetchPragmaSchemaVersion(db, pExtData, 1);
  assert(oldVersion != pExtData->pragmaSchemaVersionForTableInfos);
  assert(didChange == 1);

  // re-fetch both with no schema change again, should be same value
  oldVersion = pExtData->pragmaSchemaVersion;
  didChange = crsql_fetchPragmaSchemaVersion(db, pExtData, 0);
  assert(oldVersion == pExtData->pragmaSchemaVersion);
  assert(didChange == 0);

  oldVersion = pExtData->pragmaSchemaVersionForTableInfos;
  didChange = crsql_fetchPragmaSchemaVersion(db, pExtData, 1);
  assert(oldVersion == pExtData->pragmaSchemaVersionForTableInfos);
  assert(didChange == 0);

  crsql_finalize(pExtData);
  sqlite3_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testRecreateDbVersionStmt() {
  
}

static void fetchDbVersionFromStorage() {

}

static void getDbVersion() {

}


void crsqlExtDataTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsql_ExtData\e[0m\n");
  textNewExtData();
  testFreeExtData();
  testFinalize();
  testFetchPragmaSchemaVersion();
}
