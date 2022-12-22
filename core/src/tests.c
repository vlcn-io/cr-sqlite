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

#include <stdio.h>
#include <string.h>

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#define SUITE(N) if (strcmp(suite, "all") == 0 || strcmp(suite, N) == 0)

int crsql_close(sqlite3 *db) {
  int rc = SQLITE_OK;
  rc += sqlite3_exec(db, "SELECT crsql_finalize()", 0, 0, 0);
  rc += sqlite3_close(db);
  return rc;
}

void crsqlUtilTestSuite();
void crsqlTableInfoTestSuite();
void crsqlTestSuite();
void crsqlTriggersTestSuite();
void crsqlChangesVtabReadTestSuite();
void crsqlChangesVtabTestSuite();
void crsqlChangesVtabWriteTestSuite();
void crsqlChangesVtabCommonTestSuite();
void crsqlExtDataTestSuite();

int main(int argc, char *argv[]) {
  char *suite = "all";
  if (argc == 2) {
    suite = argv[1];
  }

  SUITE("util") crsqlUtilTestSuite();
  SUITE("tblinfo") crsqlTableInfoTestSuite();
  SUITE("triggers") crsqlTriggersTestSuite();
  SUITE("vtab") crsqlChangesVtabTestSuite();
  SUITE("vtabread") crsqlChangesVtabReadTestSuite();
  SUITE("vtabwrite") crsqlChangesVtabWriteTestSuite();
  SUITE("vtabcommon") crsqlChangesVtabCommonTestSuite();
  SUITE("extdata") crsqlExtDataTestSuite();
  // integration tests should come at the end given fixing unit tests will
  // likely fix integration tests
  SUITE("crsql") crsqlTestSuite();

  sqlite3_shutdown();
}
