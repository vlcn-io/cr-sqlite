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


void crsqlChangesVtabTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsql_changesVtab\e[0m\n");
}
