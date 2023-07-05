#ifndef CHANGES_VTAB_WRITE_H
#define CHANGES_VTAB_WRITE_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include "rust.h"
#include "tableinfo.h"

int crsql_mergeInsert(sqlite3_vtab *pVTab, int argc, sqlite3_value **argv,
                      sqlite3_int64 *pRowid, char **errmsg);

#endif