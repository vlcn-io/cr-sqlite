#include "create-crr-vtab.h"

#include <assert.h>
#include <stdint.h>
#include <string.h>

static int xCreate(sqlite3 *db, void *pAux, int argc, const char *const *argv,
                   sqlite3_vtab **ppVtab, char **pzErr) {
  sqlite3_exec(db, "CREATE TABLE woo_bg(t1, t2);", NULL, NULL, NULL);
  sqlite3_declare_vtab(db, "CREATE TABLE x(a, b);");
  *ppVtab = sqlite3_malloc(sizeof(sqlite3_vtab));
  return SQLITE_OK;
}

static int xConnect(sqlite3 *db, void *pAux, int argc, const char *const *argv,
                    sqlite3_vtab **ppVtab, char **pzErr) {
  return SQLITE_OK;
}

static int xBestIndex(sqlite3_vtab *tab, sqlite3_index_info *pIdxInfo) {
  return SQLITE_OK;
}

static int xDisconnect(sqlite3_vtab *pVtab) { return SQLITE_OK; }

static int xDestroy(sqlite3_vtab *pVtab) { return SQLITE_OK; }

static int xOpen(sqlite3_vtab *pVtab, sqlite3_vtab_cursor **ppCursor) {
  return SQLITE_OK;
}

static int xClose(sqlite3_vtab_cursor *cur) { return SQLITE_OK; }

static int xFilter(sqlite3_vtab_cursor *cur, int idxNum, const char *idxStr,
                   int argc, sqlite3_value **argv) {
  return SQLITE_OK;
}

static int xNext(sqlite3_vtab_cursor *cur) { return SQLITE_OK; }

static int xEof(sqlite3_vtab_cursor *cur) { return 1; }

static int xColumn(sqlite3_vtab_cursor *cur, sqlite3_context *ctx, int i) {
  return SQLITE_OK;
}

static int xRowid(sqlite3_vtab_cursor *cur, sqlite_int64 *pRowid) {
  return SQLITE_OK;
}

static int xCommit(sqlite3_vtab *pVtab) {
  // sqlite3_exec("DROP TABLE IF EXISTS woo;", NULL, NULL, NULL, NULL);
  return SQLITE_OK;
}

static int xSync(sqlite3_vtab *pVtab) {
  // sqlite3_exec("DROP TABLE IF EXISTS woo;", NULL, NULL, NULL, NULL);
  return SQLITE_OK;
}

sqlite3_module crsql_createCrrModule = {
    .iVersion = 1,
    .xCreate = xCreate,
    .xConnect = xConnect,
    .xBestIndex = xBestIndex,
    .xDisconnect = xDisconnect,
    .xDestroy = xDestroy,
    .xOpen = xOpen,
    .xClose = xClose,
    .xFilter = xFilter,
    .xNext = xNext,
    .xEof = xEof,
    .xColumn = xColumn,
    .xRowid = xRowid,
    .xUpdate = NULL,
    .xBegin = NULL,
    .xSync = xSync,
    .xCommit = xCommit,
    .xRollback = NULL,
    .xFindFunction = NULL,
    .xRename = NULL,
    .xSavepoint = NULL,
    .xRelease = NULL,
    .xRollbackTo = NULL,
};