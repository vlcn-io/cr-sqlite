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

#include "crsqlite.h"
#include "ext-data.h"
#include "consts.h"
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>


int crsql_close(sqlite3* db);

static void textNewExtData()
{
  printf("NewExtData\n");
  sqlite3 *db;
  int rc;
  rc = sqlite3_open(":memory:", &db);
  crsql_ExtData *pExtData = crsql_newExtData(db);

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

  crsql_finalize(pExtData);
  crsql_freeExtData(pExtData);
  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testFreeExtData()
{
  printf("FreeExtData\n");
  sqlite3 *db;
  int rc;
  rc = sqlite3_open(":memory:", &db);
  crsql_ExtData *pExtData = crsql_newExtData(db);
  
  crsql_finalize(pExtData);
  crsql_freeExtData(pExtData);
  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testFinalize()
{
  printf("FinalizeExtData\n");
  sqlite3 *db;
  int rc;
  rc = sqlite3_open(":memory:", &db);
  crsql_ExtData *pExtData = crsql_newExtData(db);

  crsql_finalize(pExtData);
  assert(pExtData->pDbVersionStmt == 0);
  assert(pExtData->pPragmaSchemaVersionStmt == 0);

  // finalizing twice should be a no-op
  crsql_finalize(pExtData);
  crsql_freeExtData(pExtData);
  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testFetchPragmaSchemaVersion()
{
  printf("FetchPragmaSchemaVersion\n");
  sqlite3 *db;
  int rc;
  int didChange = 0;
  rc = sqlite3_open(":memory:", &db);
  crsql_ExtData *pExtData = crsql_newExtData(db);

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
  crsql_freeExtData(pExtData);
  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testRecreateDbVersionStmt()
{
  printf("RecreateDbVersionStmt\n");
  sqlite3 *db;
  int rc;
  rc = sqlite3_open(":memory:", &db);
  crsql_ExtData *pExtData = crsql_newExtData(db);

  rc = crsql_recreateDbVersionStmt(db, pExtData);

  // there are no clock tables yet. nothing to create.
  assert(rc == -1);
  assert(pExtData->pDbVersionStmt == 0);

  sqlite3_exec(db, "CREATE TABLE foo (a primary key, b);", 0, 0, 0);
  sqlite3_exec(db, "SELECT crsql_as_crr('foo')", 0, 0, 0);

  rc = crsql_recreateDbVersionStmt(db, pExtData);
  assert(rc == 0);
  assert(pExtData->pDbVersionStmt != 0);

  // recreating while a created statement exists isn't an error
  rc = crsql_recreateDbVersionStmt(db, pExtData);
  assert(rc == 0);
  assert(pExtData->pDbVersionStmt != 0);

  crsql_finalize(pExtData);
  assert(pExtData->pDbVersionStmt == 0);
  crsql_freeExtData(pExtData);
  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void fetchDbVersionFromStorage()
{
  printf("FetchDBVersionFromStorage\n");
  sqlite3 *db;
  int rc;
  char *errmsg;
  rc = sqlite3_open(":memory:", &db);
  crsql_ExtData *pExtData = crsql_newExtData(db);

  rc = crsql_fetchDbVersionFromStorage(db, pExtData, &errmsg);
  // no clock tables, no version.
  assert(pExtData->dbVersion == 0);
  assert(rc == SQLITE_OK);

  // this was a bug where calling twice on a fresh db would fail the second time.
  rc = crsql_fetchDbVersionFromStorage(db, pExtData, &errmsg);
  // should still return same data on a subsequent call with no schema changes
  assert(pExtData->dbVersion == 0);
  assert(rc == SQLITE_OK);

  // create some schemas
  sqlite3_exec(db, "CREATE TABLE foo (a primary key, b);", 0, 0, 0);
  sqlite3_exec(db, "SELECT crsql_as_crr('foo')", 0, 0, 0);
  // still v0 since no rows are inserted
  rc = crsql_fetchDbVersionFromStorage(db, pExtData, &errmsg);
  assert(pExtData->dbVersion == 0);
  assert(rc == SQLITE_OK);

  // version is bumped due to insert
  sqlite3_exec(db, "INSERT INTO foo VALUES (1, 2)", 0, 0, 0);
  rc = crsql_fetchDbVersionFromStorage(db, pExtData, &errmsg);
  assert(pExtData->dbVersion == 1);
  assert(rc == SQLITE_OK);

  sqlite3_exec(db, "CREATE TABLE bar (a primary key, b);", 0, 0, 0);
  sqlite3_exec(db, "SELECT crsql_as_crr('bar')", 0, 0, 0);
  sqlite3_exec(db, "INSERT INTO bar VALUES (1, 2)", 0, 0, 0);
  // we catch the schema change and get a version from the new table
  rc = crsql_fetchDbVersionFromStorage(db, pExtData, &errmsg);
  assert(pExtData->dbVersion == 2);
  assert(rc == SQLITE_OK);

  rc = crsql_fetchDbVersionFromStorage(db, pExtData, &errmsg);
  assert(pExtData->dbVersion == 2);
  assert(rc == SQLITE_OK);

  crsql_finalize(pExtData);
  crsql_freeExtData(pExtData);
  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

// getDbVersion hits a cache before storage.
// cache shouldn't change behavior.
static void getDbVersion()
{
  // this is tested in python integration tests due to the fact that it relies on a commit hook
  // being installed.
}

void crsqlExtDataTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsql_ExtData\e[0m\n");
  textNewExtData();
  testFreeExtData();
  testFinalize();
  testFetchPragmaSchemaVersion();
  testRecreateDbVersionStmt();
  fetchDbVersionFromStorage();
  getDbVersion();
}
