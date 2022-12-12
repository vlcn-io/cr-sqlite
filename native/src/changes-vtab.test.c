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
#include "changes-vtab.h"
#include "consts.h"
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

int crsql_close(sqlite3 *db);

static void testManyPkTable()
{
  printf("ManyPkTable\n");

  sqlite3 *db;
  sqlite3_stmt *pStmt;
  int rc;
  rc = sqlite3_open(":memory:", &db);

  rc = sqlite3_exec(db, "CREATE TABLE foo (a, b, c, primary key (a, b));", 0, 0, 0);
  rc += sqlite3_exec(db, "SELECT crsql_as_crr('foo');", 0, 0, 0);
  rc += sqlite3_exec(db, "INSERT INTO foo VALUES (4,5,6);", 0, 0, 0);
  assert(rc == SQLITE_OK);

  rc += sqlite3_prepare_v2(db, "SELECT * FROM crsql_changes()", -1, &pStmt, 0);
  assert(rc == SQLITE_OK);

  while (sqlite3_step(pStmt) == SQLITE_ROW)
  {
    const unsigned char *pk = sqlite3_column_text(pStmt, 1);
    assert(strcmp("4|5", (char *)pk) == 0);
  }

  sqlite3_finalize(pStmt);
  crsql_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

// static void testSinglePksTable()
// {
// }

// static void testOnlyPkTable()
// {
// }

// static void testSciNotation()
// {
// }

// static void testHex()
// {
// }

void crsqlChangesVtabTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsql_changesVtab\e[0m\n");
  testManyPkTable();
}
