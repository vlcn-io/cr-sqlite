#include "crsqlite.h"
#include "changes-vtab-write.h"
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

static void testAllReceivedCids()
{
  printf("AllReceivedCids\n");

  int rc = SQLITE_OK;
  sqlite3 *db;
  rc = sqlite3_open(":memory:", &db);
  char *err = 0;
  int numReceivedCids = 0;

  // test delete sentinel
  char *colVrsns = sqlite3_mprintf("{\"%d\": 1}", DELETE_CID_SENTINEL);
  int *cidMap = crsql_allReceivedCids(
      db,
      (unsigned char*)colVrsns,
      2,
      &numReceivedCids);
  sqlite3_free(colVrsns);
  // got delete case back
  assert(cidMap[0] == -1);
  assert(numReceivedCids == 0);
  sqlite3_free(cidMap);

  // test 0 cols received
  // this is if a new row is entered with only primary keys
  cidMap = crsql_allReceivedCids(
      db,
      (unsigned char*)"{}",
      2,
      &numReceivedCids);
  assert(numReceivedCids == 0);
  assert(cidMap[0] == -2);
  assert(cidMap[1] == -2);
  sqlite3_free(cidMap);

  // test more cols in json than cols in table
  numReceivedCids = 0;
  cidMap = crsql_allReceivedCids(
      db,
      (unsigned char*)"{\"0\": 1, \"1\": 2, \"2\": 3}",
      2,
      &numReceivedCids);
  assert(cidMap == 0);
  assert(numReceivedCids == 0);

  // test bad cids in json
  cidMap = crsql_allReceivedCids(
      db,
      (unsigned char*)"{\"100\": 1, \"1\": 2}",
      2,
      &numReceivedCids);
  assert(cidMap == 0);
  assert(numReceivedCids == 0);

  cidMap = crsql_allReceivedCids(
      db,
      (unsigned char*)"{\"-2\": 1, \"1\": 2}",
      2,
      &numReceivedCids);
  assert(cidMap == 0);
  assert(numReceivedCids == 0);

  // test correct case
  cidMap = crsql_allReceivedCids(
      db,
      (unsigned char*)"{\"0\": 1, \"1\": 2}",
      2,
      &numReceivedCids);
  assert(cidMap[0] == 0);
  assert(cidMap[1] == 1);
  assert(numReceivedCids == 2);

  printf("\t\e[0;32mSuccess\e[0m\n");
fail:
  sqlite3_free(err);
  sqlite3_close(db);
  assert(rc == SQLITE_OK);
}

static void memTestMergeInsert()
{
  // test delete case
  // test nothing to merge case
  // test normal merge
  // test error / early returns
}

static void testMergeInsert()
{
}

static void testChangesTabConflictSets()
{
}

static void testAllChangedCids()
{
  int rc = SQLITE_OK;
  sqlite3 *db;
  rc = sqlite3_open(":memory:", &db);
  char *err = 0;

  // test

  printf("\t\e[0;32mSuccess\e[0m\n");
fail:
  sqlite3_free(err);
  sqlite3_close(db);
  assert(rc == SQLITE_OK);
}

void crsqlChangesVtabWriteTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsql_changesVtabWrite\e[0m\n");

  testAllReceivedCids();
}