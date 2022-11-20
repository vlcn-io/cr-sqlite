#include "changes-vtab-common.h"
#include "consts.h"
#include <string.h>
#include "util.h"

char *crsql_extractWhereList(
    crsql_ColumnInfo *zColumnInfos,
    int columnInfosLen,
    const char *quoteConcatedVals)
{
  char **zzParts = 0;
  if (columnInfosLen == 1)
  {
    zzParts = sqlite3_malloc(1 * sizeof(char *));
    zzParts[0] = crsql_strdup(quoteConcatedVals);
  }
  else
  {
    // zzParts will not be greater or less than columnInfosLen.
    zzParts = crsql_splitQuoteConcat(quoteConcatedVals, columnInfosLen);
  }

  if (zzParts == 0)
  {
    return 0;
  }

  for (int i = 0; i < columnInfosLen; ++i)
  {
    // this is safe since pks are extracted as `quote` in the prior queries
    // %z will de-allocate pksArr[i] so we can re-allocate it in the assignment
    zzParts[i] = sqlite3_mprintf("\"%s\" = %z", zColumnInfos[i].name, zzParts[i]);
  }

  // join2 will free the contents of zzParts given identity is a pass-thru
  char *ret = crsql_join2((char *(*)(const char *)) & crsql_identity, zzParts, columnInfosLen, " AND ");
  sqlite3_free(zzParts);
  return ret;
}

// parts must already be properly quoted and escaped for inclusion in a SQL statement
char *crsql_quotedValuesAsList(char **parts, int numParts)
{
  int len = 0;
  for (int i = 0; i < numParts; ++i)
  {
    len += strlen(parts[i]);
  }
  len += numParts - 1;
  char *ret = sqlite3_malloc((len + 1) * sizeof *ret);
  crsql_joinWith(ret, parts, numParts, ',');
  ret[len] = '\0';

  return ret;
}

char *crsql_quoteConcatedValuesAsList(
    const char *quoteConcatedVals,
    int len)
{
  char **parts = crsql_splitQuoteConcat(quoteConcatedVals, len);
  if (parts == 0)
  {
    return 0;
  }

  char *ret = crsql_quotedValuesAsList(parts, len);
  for (int i = 0; i < len; ++i) {
    sqlite3_free(parts[i]);
  }
  sqlite3_free(parts);

  return ret;
}
