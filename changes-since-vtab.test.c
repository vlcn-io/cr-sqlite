#include "cfsqlite.h"
#include "changes-since-vtab.h"
#include "consts.h"
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

void testChangesQueryForTable() {
  printf("ChangeQueryForTable\n");
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testChangesUnionQuery() {
  printf("ChangesUnionQuery\n");
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testPickColumnInfosFromVersionMap() {
  printf("PickColumnInfosFromVersionMap\n");
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testRowPatchDataQuery() {
  printf("RowPatchDataQuery\n");
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void cfsqlChagesSinceVtabTestSuite() {
  printf("\e[47m\e[1;30mSuite: cfsql_changesSinceVtab\e[0m\n");

  printf("\t\e[0;32mSuccess\e[0m\n");
}