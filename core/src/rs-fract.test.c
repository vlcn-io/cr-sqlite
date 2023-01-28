/**
 * Copyright 2023 One Law LLC. All Rights Reserved.
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

#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "crsqlite.h"
int crsql_close(sqlite3 *db);

static void testAsOrdered() {
  printf("AsOrdered\n");

  sqlite3 *db;
  int rc;

  rc = sqlite3_open(":memory:", &db);
  rc += sqlite3_exec(db,
                     "CREATE TABLE todo (id primary key, list_id, ordering, "
                     "content, complete);",
                     0, 0, 0);
  rc += sqlite3_exec(
      db, "CREATE INDEX todo_list_id_ordering ON todo (list_id, ordering);", 0,
      0, 0);
  assert(rc == SQLITE_OK);

  // Test 1 list column
  rc += sqlite3_exec(
      db, "SELECT crsql_fract_as_ordered('todo', 'ordering', 'list_id')", 0, 0,
      0);
  assert(rc == SQLITE_OK);

  // Test idempotency
  rc += sqlite3_exec(
      db, "SELECT crsql_fract_as_ordered('todo', 'ordering', 'list_id')", 0, 0,
      0);
  assert(rc == SQLITE_OK);

  // test prepend
  rc += sqlite3_exec(db, "INSERT INTO todo VALUES (1, 1, -1, 'head', false)", 0,
                     0, 0);
  assert(rc == SQLITE_OK);
  sqlite3_stmt *pStmt;
  rc += sqlite3_prepare_v2(db, "SELECT ordering FROM todo WHERE id = 1", -1,
                           &pStmt, 0);
  assert(rc == SQLITE_OK);
  sqlite3_step(pStmt);
  const unsigned char *order = sqlite3_column_text(pStmt, 0);
  assert(strcmp((const char *)order, "a0") == 0);
  sqlite3_finalize(pStmt);

  // test append
  rc += sqlite3_exec(db, "INSERT INTO todo VALUES (2, 1, 1, 'tail', false)", 0,
                     0, 0);
  assert(rc == SQLITE_OK);
  pStmt;
  rc += sqlite3_prepare_v2(db, "SELECT ordering FROM todo WHERE id = 2", -1,
                           &pStmt, 0);
  assert(rc == SQLITE_OK);
  sqlite3_step(pStmt);
  order = sqlite3_column_text(pStmt, 0);
  assert(strcmp((const char *)order, "a1") == 0);
  sqlite3_finalize(pStmt);

  // test insert after head

  // test insert before head

  // test insert after

  // test move after

  // make some collisions

  // Test no list columns
  rc += sqlite3_exec(db, "SELECT crsql_fract_as_ordered('todo', 'ordering')", 0,
                     0, 0);
  assert(rc == SQLITE_OK);

  // Test many list column

  // Schema change and re-run test

  printf("\t\e[0;32mSuccess\e[0m\n");
  crsql_close(db);
}

void crsqlFractSuite() {
  printf("\e[47m\e[1;30mSuite: fract\e[0m\n");

  testAsOrdered();
}
