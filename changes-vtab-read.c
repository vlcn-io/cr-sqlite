#include "changes-vtab-read.h"
#include "consts.h"
#include "util.h"

/**
 * Construct the query to grab the changes made against
 * rows in a given table
 */
char *crsql_changesQueryForTable(crsql_TableInfo *tableInfo)
{
  if (tableInfo->pksLen == 0)
  {
    return 0;
  }

  char *zSql = sqlite3_mprintf(
      "SELECT\
      %z as pks,\
      '%s' as tbl,\
      json_group_object(__crsql_col_num, __crsql_version) as col_vrsns,\
      count(__crsql_col_num) as num_cols,\
      min(__crsql_version) as min_v\
    FROM \"%s__crsql_clock\"\
    WHERE\
      __crsql_site_id != ?\
    AND\
      __crsql_version > ?\
    GROUP BY pks",
      crsql_quoteConcat(tableInfo->pks, tableInfo->pksLen),
      tableInfo->tblName,
      tableInfo->tblName);

  return zSql;
}

/**
 * Union all the crr tables together to get a comprehensive
 * set of changes
 */
char *crsql_changesUnionQuery(
    crsql_TableInfo **tableInfos,
    int tableInfosLen)
{
  char *unionsArr[tableInfosLen];
  char *unionsStr = 0;
  int i = 0;

  for (i = 0; i < tableInfosLen; ++i)
  {
    unionsArr[i] = crsql_changesQueryForTable(tableInfos[i]);
    if (unionsArr[i] == 0)
    {
      for (int j = 0; j < i; j++)
      {
        sqlite3_free(unionsArr[j]);
      }
      return 0;
    }

    if (i < tableInfosLen - 1)
    {
      unionsArr[i] = sqlite3_mprintf("%z %s ", unionsArr[i], UNION);
    }
  }

  // move the array of strings into a single string
  unionsStr = crsql_join(unionsArr, tableInfosLen);
  // free the strings in the array
  for (i = 0; i < tableInfosLen; ++i)
  {
    sqlite3_free(unionsArr[i]);
  }

  // compose the final query
  return sqlite3_mprintf(
      "SELECT tbl, pks, num_cols, col_vrsns, min_v FROM (%z) ORDER BY min_v, tbl ASC",
      unionsStr);
  // %z frees unionsStr https://www.sqlite.org/printf.html#percentz
}
