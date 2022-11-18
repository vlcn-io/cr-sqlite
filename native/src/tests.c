#include <stdio.h>
#include <string.h>
#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#define SUITE(N) if (strcmp(suite, "all") == 0 || strcmp(suite, N) == 0)

void crsql_close(sqlite3* db) {
  sqlite3_exec(db, "SELECT crsql_finalize()", 0, 0, 0);
  sqlite3_close(db);
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

int main(int argc, char *argv[])
{
  char * suite = "all";
  if (argc == 2) {
    suite = argv[1];
  }

  SUITE("util") crsqlUtilTestSuite();
  SUITE("tblinfo") crsqlTableInfoTestSuite();
  SUITE("crsql") crsqlTestSuite();
  SUITE("triggers") crsqlTriggersTestSuite();
  SUITE("vtab") crsqlChangesVtabTestSuite();
  SUITE("vtabread") crsqlChangesVtabReadTestSuite();
  SUITE("vtabwrite") crsqlChangesVtabWriteTestSuite();
  SUITE("vtabcommon") crsqlChangesVtabCommonTestSuite();
  SUITE("extdata") crsqlExtDataTestSuite();
}
