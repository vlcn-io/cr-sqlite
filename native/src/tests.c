#include <stdio.h>
#include <string.h>

#define SUITE(N) if (strcmp(suite, "all") == 0 || strcmp(suite, N) == 0)

void crsqlUtilTestSuite();
void crsqlTableInfoTestSuite();
void crsqlTestSuite();
void crsqlTriggersTestSuite();
void crsqlChangesVtabReadTestSuite();
void crsqlChangesVtabTestSuite();
void crsqlChangesVtabWriteTestSuite();
void crsqlChangesVtabCommonTestSuite();

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
}
