#include "changes-vtab-common.h"

#include <string.h>

#include "consts.h"
#include "util.h"

/**
 * Creates a `col_name = ? AND other_col = ? AND ...` expression
 */
char *crsql_extractWhereList(crsql_ColumnInfo *zColumnInfos,
                             int columnInfosLen) {
  char **zzParts = sqlite3_malloc(columnInfosLen * sizeof(char *));

  if (zzParts == 0) {
    return 0;
  }

  for (int i = 0; i < columnInfosLen; ++i) {
    zzParts[i] = sqlite3_mprintf("\"%w\" = ?", zColumnInfos[i].name);
  }

  // join2 will free the contents of zzParts given identity is a pass-thru
  char *ret = crsql_join2((char *(*)(const char *)) & crsql_identity, zzParts,
                          columnInfosLen, " AND ");
  sqlite3_free(zzParts);
  return ret;
}

/**
 * Create a list of `?,?,?...` based on `numSlots`
 */
char *crsql_bindingList(int numSlots) {
  int len = numSlots * 2;
  char *ret = sqlite3_malloc(len * sizeof *ret);
  if (ret == 0) {
    return ret;
  }
  for (int i = 0; i < numSlots; ++i) {
    if (i != 0) {
      ret[i * 2 - 1] = ',';
    }
    ret[i * 2] = '?';
  }
  ret[len - 1] = '\0';

  return ret;
}
