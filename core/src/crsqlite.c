#include "crsqlite.h"
SQLITE_EXTENSION_INIT1

#include <assert.h>
#include <ctype.h>
#include <limits.h>
#include <stdint.h>
#include <string.h>

#include "changes-vtab.h"
#include "consts.h"
#include "ext-data.h"
#include "rust.h"

// see
// https://github.com/chromium/chromium/commit/579b3dd0ea41a40da8a61ab87a8b0bc39e158998
// & https://github.com/rust-lang/rust/issues/73632 &
// https://sourcegraph.com/github.com/chromium/chromium/-/commit/579b3dd0ea41a40da8a61ab87a8b0bc39e158998?visible=1
#ifdef CRSQLITE_WASM
unsigned char __rust_no_alloc_shim_is_unstable;
#endif

static void incrementAndGetSeqFunc(sqlite3_context *context, int argc,
                                   sqlite3_value **argv) {
  crsql_ExtData *pExtData = (crsql_ExtData *)sqlite3_user_data(context);
  sqlite3_result_int(context, pExtData->seq);
  pExtData->seq += 1;
}

static void getSeqFunc(sqlite3_context *context, int argc,
                       sqlite3_value **argv) {
  crsql_ExtData *pExtData = (crsql_ExtData *)sqlite3_user_data(context);
  sqlite3_result_int(context, pExtData->seq);
}

/**
 * Takes a table name and turns it into a CRR.
 *
 * This allows users to create and modify tables as normal.
 */
static void crsqlMakeCrrFunc(sqlite3_context *context, int argc,
                             sqlite3_value **argv) {
  const char *tblName = 0;
  const char *schemaName = 0;
  int rc = SQLITE_OK;
  sqlite3 *db = sqlite3_context_db_handle(context);
  char *errmsg = 0;

  if (argc == 0) {
    sqlite3_result_error(
        context,
        "Wrong number of args provided to crsql_as_crr. Provide the schema "
        "name and table name or just the table name.",
        -1);
    return;
  }

  if (argc == 2) {
    schemaName = (const char *)sqlite3_value_text(argv[0]);
    tblName = (const char *)sqlite3_value_text(argv[1]);
  } else {
    schemaName = "main";
    tblName = (const char *)sqlite3_value_text(argv[0]);
  }

  rc = sqlite3_exec(db, "SAVEPOINT as_crr", 0, 0, &errmsg);
  if (rc != SQLITE_OK) {
    sqlite3_result_error(context, errmsg, -1);
    sqlite3_free(errmsg);
    return;
  }

  rc = crsql_create_crr(db, schemaName, tblName, 0, 0, &errmsg);
  if (rc != SQLITE_OK) {
    sqlite3_result_error(context, errmsg, -1);
    sqlite3_result_error_code(context, rc);
    sqlite3_free(errmsg);
    sqlite3_exec(db, "ROLLBACK", 0, 0, 0);
    return;
  }

  sqlite3_exec(db, "RELEASE as_crr", 0, 0, 0);
}

static void crsqlBeginAlterFunc(sqlite3_context *context, int argc,
                                sqlite3_value **argv) {
  const char *tblName = 0;
  const char *schemaName = 0;
  int rc = SQLITE_OK;
  sqlite3 *db = sqlite3_context_db_handle(context);
  char *errmsg = 0;

  if (argc == 0) {
    sqlite3_result_error(
        context,
        "Wrong number of args provided to crsql_as_crr. Provide the schema "
        "name and table name or just the table name.",
        -1);
    return;
  }

  if (argc == 2) {
    schemaName = (const char *)sqlite3_value_text(argv[0]);
    tblName = (const char *)sqlite3_value_text(argv[1]);
  } else {
    schemaName = "main";
    tblName = (const char *)sqlite3_value_text(argv[0]);
  }

  rc = sqlite3_exec(db, "SAVEPOINT alter_crr", 0, 0, &errmsg);
  if (rc != SQLITE_OK) {
    sqlite3_result_error(context, errmsg, -1);
    sqlite3_free(errmsg);
    return;
  }

  rc = crsql_remove_crr_triggers_if_exist(db, tblName);
  if (rc != SQLITE_OK) {
    sqlite3_result_error(context, errmsg, -1);
    sqlite3_free(errmsg);
    sqlite3_exec(db, "ROLLBACK", 0, 0, 0);
    return;
  }
}

int crsql_compact_post_alter(sqlite3 *db, const char *tblName,
                             crsql_ExtData *pExtData, char **errmsg);

static void crsqlCommitAlterFunc(sqlite3_context *context, int argc,
                                 sqlite3_value **argv) {
  const char *tblName = 0;
  const char *schemaName = 0;
  int rc = SQLITE_OK;
  sqlite3 *db = sqlite3_context_db_handle(context);
  char *errmsg = 0;

  if (argc == 0) {
    sqlite3_result_error(
        context,
        "Wrong number of args provided to crsql_commit_alter. Provide the "
        "schema name and table name or just the table name.",
        -1);
    return;
  }

  if (argc == 2) {
    schemaName = (const char *)sqlite3_value_text(argv[0]);
    tblName = (const char *)sqlite3_value_text(argv[1]);
  } else {
    schemaName = "main";
    tblName = (const char *)sqlite3_value_text(argv[0]);
  }

  crsql_ExtData *pExtData = (crsql_ExtData *)sqlite3_user_data(context);
  rc = crsql_compact_post_alter(db, tblName, pExtData, &errmsg);
  if (rc == SQLITE_OK) {
    rc = crsql_create_crr(db, schemaName, tblName, 1, 0, &errmsg);
  }
  if (rc == SQLITE_OK) {
    rc = sqlite3_exec(db, "RELEASE alter_crr", 0, 0, &errmsg);
  }
  if (rc != SQLITE_OK) {
    sqlite3_result_error(context, errmsg, -1);
    sqlite3_free(errmsg);
    sqlite3_exec(db, "ROLLBACK", 0, 0, 0);
    return;
  }
}

static void freeConnectionExtData(void *pUserData) {
  crsql_ExtData *pExtData = (crsql_ExtData *)pUserData;

  crsql_freeExtData(pExtData);
}

static void crsqlFinalize(sqlite3_context *context, int argc,
                          sqlite3_value **argv) {
  crsql_ExtData *pExtData = (crsql_ExtData *)sqlite3_user_data(context);
  crsql_finalize(pExtData);
}

static void crsqlRowsImpacted(sqlite3_context *context, int argc,
                              sqlite3_value **argv) {
  crsql_ExtData *pExtData = (crsql_ExtData *)sqlite3_user_data(context);
  sqlite3_result_int(context, pExtData->rowsImpacted);
}

static int commitHook(void *pUserData) {
  crsql_ExtData *pExtData = (crsql_ExtData *)pUserData;

  pExtData->dbVersion = pExtData->pendingDbVersion;
  pExtData->pendingDbVersion = -1;
  pExtData->seq = 0;
  pExtData->updatedTableInfosThisTx = 0;
  pExtData->readDbVersionThisTx = 0;
  return SQLITE_OK;
}

static void rollbackHook(void *pUserData) {
  crsql_ExtData *pExtData = (crsql_ExtData *)pUserData;

  pExtData->pendingDbVersion = -1;
  pExtData->seq = 0;
  pExtData->updatedTableInfosThisTx = 0;
  pExtData->readDbVersionThisTx = 0;
}

#ifdef LIBSQL
static void closeHook(void *pUserData, sqlite3 *db) {
  crsql_ExtData *pExtData = (crsql_ExtData *)pUserData;
  crsql_finalize(pExtData);
}
#endif

void *sqlite3_crsqlrustbundle_init(sqlite3 *db, char **pzErrMsg,
                                   const sqlite3_api_routines *pApi);

#ifdef _WIN32
__declspec(dllexport)
#endif
    int sqlite3_crsqlite_init(sqlite3 *db, char **pzErrMsg,
                              const sqlite3_api_routines *pApi
#ifdef LIBSQL
                              ,
                              const libsql_api_routines *pLibsqlApi
#endif
    ) {
  int rc = SQLITE_OK;

  SQLITE_EXTENSION_INIT2(pApi);
#ifdef LIBSQL
  LIBSQL_EXTENSION_INIT2(pLibsqlApi);
#endif

  // TODO: should be moved lower once we finish migrating to rust.
  // RN it is safe here since the rust bundle init is largely just reigstering
  // function pointers. we need to init the rust bundle otherwise sqlite api
  // methods are not isntalled when we start calling rust
  crsql_ExtData *pExtData = sqlite3_crsqlrustbundle_init(db, pzErrMsg, pApi);
  if (pExtData == 0) {
    return SQLITE_ERROR;
  }

  if (rc == SQLITE_OK) {
    rc = sqlite3_create_function(db, "crsql_increment_and_get_seq", 0,
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS, pExtData,
                                 incrementAndGetSeqFunc, 0, 0);
  }
  if (rc == SQLITE_OK) {
    rc = sqlite3_create_function(
        db, "crsql_get_seq", 0,
        SQLITE_UTF8 | SQLITE_INNOCUOUS | SQLITE_DETERMINISTIC, pExtData,
        getSeqFunc, 0, 0);
  }

  if (rc == SQLITE_OK) {
    // Only register a commit hook, not update or pre-update, since all rows
    // in the same transaction should have the same clock value. This allows
    // us to replicate them together and ensure more consistency.
    rc = sqlite3_create_function(db, "crsql_as_crr", -1,
                                 // crsql should only ever be used at the top
                                 // level and does a great deal to modify
                                 // existing database state. directonly.
                                 SQLITE_UTF8 | SQLITE_DIRECTONLY, 0,
                                 crsqlMakeCrrFunc, 0, 0);
  }

  if (rc == SQLITE_OK) {
    rc = sqlite3_create_function(db, "crsql_begin_alter", -1,
                                 SQLITE_UTF8 | SQLITE_DIRECTONLY, 0,
                                 crsqlBeginAlterFunc, 0, 0);
  }

  if (rc == SQLITE_OK) {
    rc = sqlite3_create_function(db, "crsql_commit_alter", -1,
                                 SQLITE_UTF8 | SQLITE_DIRECTONLY, pExtData,
                                 crsqlCommitAlterFunc, 0, 0);
  }

  if (rc == SQLITE_OK) {
    // see https://sqlite.org/forum/forumpost/c94f943821
    rc = sqlite3_create_function(db, "crsql_finalize", -1,
                                 SQLITE_UTF8 | SQLITE_DIRECTONLY, pExtData,
                                 crsqlFinalize, 0, 0);
  }

  if (rc == SQLITE_OK) {
    rc = sqlite3_create_function(db, "crsql_after_update", -1,
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS, pExtData,
                                 crsql_after_update, 0, 0);
  }
  if (rc == SQLITE_OK) {
    rc = sqlite3_create_function(db, "crsql_after_insert", -1,
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS, pExtData,
                                 crsql_after_insert, 0, 0);
  }
  if (rc == SQLITE_OK) {
    rc = sqlite3_create_function(db, "crsql_after_delete", -1,
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS, pExtData,
                                 crsql_after_delete, 0, 0);
  }

  if (rc == SQLITE_OK) {
    rc = sqlite3_create_function(db, "crsql_rows_impacted", 0,
                                 SQLITE_UTF8 | SQLITE_INNOCUOUS, pExtData,
                                 crsqlRowsImpacted, 0, 0);
  }

  if (rc == SQLITE_OK) {
    rc = sqlite3_create_module_v2(db, "crsql_changes", &crsql_changesModule,
                                  pExtData, 0);
  }

  if (rc == SQLITE_OK) {
#ifdef LIBSQL
    libsql_close_hook(db, closeHook, pExtData);
#endif
    // TODO: get the prior callback so we can call it rather than replace
    // it?
    sqlite3_commit_hook(db, commitHook, pExtData);
    sqlite3_rollback_hook(db, rollbackHook, pExtData);
  }

  return rc;
}