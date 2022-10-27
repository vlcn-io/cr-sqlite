#include "crsqlite.h"
#include "changes-vtab-common.h"
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

static void testExtractWhereList()
{
  crsql_ColumnInfo columnInfos[3];

  columnInfos[0].name = "foo";
  columnInfos[1].name = "bar";
  columnInfos[2].name = "baz";

  // Test not enough parts
  char *whereList = crsql_extractWhereList(
      columnInfos,
      3,
      "");
  assert(whereList == 0);
  sqlite3_free(whereList);

  // Test too many parts
  whereList = crsql_extractWhereList(
      columnInfos,
      3,
      "'a'|'b'|'c'|'d'");
  assert(whereList == 0);

  // Just right
  whereList = crsql_extractWhereList(
      columnInfos,
      3,
      "'a'|'b'|'c'");
  assert(
      strcmp("\"foo\" = 'a' AND \"bar\" = 'b' AND \"baz\" = 'c'", whereList) == 0);
  sqlite3_free(whereList);
}

void crsqlChangesVtabCommonTestSuite()
{
  testExtractWhereList();
  printf("\e[47m\e[1;30mSuite: crsql_changesVtabCommon\e[0m\n");
}
