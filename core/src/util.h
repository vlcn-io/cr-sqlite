#ifndef CRSQLITE_UTIL
#define CRSQLITE_UTIL

#include <ctype.h>
#include <stddef.h>

#include "crsqlite.h"

char *crsql_getDbVersionUnionQuery(int numRows, char **tableNames);

char *crsql_join(char **in, size_t inlen);

#endif