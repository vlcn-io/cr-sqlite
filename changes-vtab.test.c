#include "crsqlite.h"
#include "changes-vtab.h"
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

// TODO: spawn some threads and test various orders of updates
void testChangesTxCommit() {
  printf("ChangesTxCommit\n");

  crsql_Changes_vtab tab;
  sqlite3_vtab *casted = (sqlite3_vtab *)&tab;
  tab.maxSeenPatchVersion = 10000;
  printf("v: %lld", crsql_dbVersion);

  assert(crsql_dbVersion < 1000);

  crsql_changesTxCommit(casted);
  assert(crsql_dbVersion == 10000);

  tab.maxSeenPatchVersion = MIN_POSSIBLE_DB_VERSION;
  crsql_changesTxCommit(casted);
  assert(crsql_dbVersion == 10000);

  tab.maxSeenPatchVersion = 30000;
  crsql_changesTxCommit(casted);
  assert(crsql_dbVersion == 30000);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void crsqlChangesVtabTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsql_changesVtab\e[0m\n");
  testChangesTxCommit();
}
