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
#include "changes-vtab-write.h"
#include "consts.h"
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

int crsql_close(sqlite3* db);

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
  crsql_close(db);
  assert(rc == SQLITE_OK);
}

void crsqlChangesVtabWriteTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsql_changesVtabWrite\e[0m\n");

  testDidCidWin();
}