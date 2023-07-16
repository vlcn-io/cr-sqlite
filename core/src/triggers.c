#include "triggers.h"

#include <stdint.h>
#include <string.h>

#include "consts.h"
#include "tableinfo.h"
#include "util.h"

int crsql_createCrrTriggers(sqlite3 *db, crsql_TableInfo *tableInfo,
                            char **err) {
  int rc = crsql_create_insert_trigger(db, tableInfo, err);
  if (rc == SQLITE_OK) {
    rc = crsql_create_update_trigger(db, tableInfo, err);
  }
  if (rc == SQLITE_OK) {
    rc = crsql_create_delete_trigger(db, tableInfo, err);
  }

  return rc;
}
