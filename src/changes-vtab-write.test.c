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

static void testDidCidWin()
{
  printf("AllChangedCids\n");

  int rc = SQLITE_OK;
  sqlite3 *db;
  rc = sqlite3_open(":memory:", &db);
  char *err = 0;

  // test
  // crsql_allChangedCids(
  //   db,
  //   "",
  //   "",
  //   "",

  // );

  printf("\t\e[0;32mSuccess\e[0m\n");
fail:
  sqlite3_free(err);
  sqlite3_close(db);
  assert(rc == SQLITE_OK);
}

void crsqlChangesVtabWriteTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsql_changesVtabWrite\e[0m\n");

  testDidCidWin();
}