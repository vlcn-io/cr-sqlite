#include "changes-vtab-common.h"
#include "consts.h"
#include <string.h>
#include "util.h"

char *crsql_extractPkWhereList(
    crsql_TableInfo *tblInfo,
    const char *pks)
{
  char **pksArr = 0;
  if (tblInfo->pksLen == 1)
  {
    pksArr = sqlite3_malloc(1 * sizeof(char *));
    pksArr[0] = strdup(pks);
  }
  else
  {
    // split it up and assign
    pksArr = crsql_split(pks, PK_DELIM, tblInfo->pksLen);
  }

  if (pksArr == 0)
  {
    return 0;
  }

  for (int i = 0; i < tblInfo->pksLen; ++i)
  {
    // this is safe since pks are extracted as `quote` in the prior queries
    // %z will de-allocate pksArr[i] so we can re-allocate it in the assignment
    // TODO: we currently invoke this in a non safe case
    // where pksArr is receive from a network socket rather than the
    // local db.
    pksArr[i] = sqlite3_mprintf("\"%s\" = %z", tblInfo->pks[i].name, pksArr[i]);
  }

  // join2 will free the contents of pksArr given identity is a pass-thru
  char *ret = crsql_join2((char *(*)(const char *)) & crsql_identity, pksArr, tblInfo->pksLen, " AND ");
  sqlite3_free(pksArr);
  return ret;
}