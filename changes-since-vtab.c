// https://www.sqlite.org/unionvtab.html
// https://www.sqlite.org/swarmvtab.html#overview
// https://www.sqlite.org/carray.html
#if !defined(SQLITEINT_H)
#include "sqlite3ext.h"
#endif
SQLITE_EXTENSION_INIT3
#include <string.h>
#include <assert.h>

/* templatevtab_vtab is a subclass of sqlite3_vtab which is
** underlying representation of the virtual table
*/
typedef struct cfsql_ChangesSince_vtab cfsql_ChangesSince_vtab;
struct cfsql_ChangesSince_vtab {
  sqlite3_vtab base;  /* Base class - must be first */
  /* Add new fields here, as necessary */
};

/* templatevtab_cursor is a subclass of sqlite3_vtab_cursor which will
** serve as the underlying representation of a cursor that scans
** over rows of the result
*/
typedef struct cfsql_ChangesSince_cursor cfsql_ChangesSince_cursor;
struct cfsql_ChangesSince_cursor {
  sqlite3_vtab_cursor base;  /* Base class - must be first */

  // The statement that is returning what identifiers
  // of what has changed
  sqlite3_stmt *pChangeSrc;
  // The statement that fetches the singular row for what change is
  // currently being processed
  sqlite3_stmt *pRowStmt;

  // char *tbl;
  // char *pks;
  // char *colVals;
  // char *colVsns;
  // sqlite3_int64 minv;
};

/*
** The changesSinceVtabConnect() method is invoked to create a new
** template virtual table.
**
** Think of this routine as the constructor for templatevtab_vtab objects.
**
** All this routine needs to do is:
**
**    (1) Allocate the templatevtab_vtab object and initialize all fields.
**
**    (2) Tell SQLite (via the sqlite3_declare_vtab() interface) what the
**        result set of queries against the virtual table will look like.
*/
static int changesSinceConnect(
  sqlite3 *db,
  void *pAux,
  int argc, const char *const*argv,
  sqlite3_vtab **ppVtab,
  char **pzErr
){
  cfsql_ChangesSince_vtab *pNew;
  int rc;

  // TODO: future improvement to include txid
  rc = sqlite3_declare_vtab(db,
           "CREATE TABLE x([tbl], [pks], [col_vals], [col_vsns], [min_v])"
       );
#define CHANGES_SINCE_VTAB_TBL  0
#define CHANGES_SINCE_VTAB_PKS  1
#define CHANGES_SINCE_VTAB_COL_VALS 2
#define CHANGES_SINCE_VTAB_COL_VSNS 3
#define CHANGES_SINCE_VTAB_MIN_V 4
  if( rc==SQLITE_OK ){
    pNew = sqlite3_malloc( sizeof(*pNew) );
    *ppVtab = (sqlite3_vtab*)pNew;
    if( pNew==0 ) return SQLITE_NOMEM;
    memset(pNew, 0, sizeof(*pNew));
  }
  return rc;
}

/*
** Destructor for ChangesSince_vtab objects
*/
static int changesSinceDisconnect(sqlite3_vtab *pVtab){
  cfsql_ChangesSince_vtab *p = (cfsql_ChangesSince_vtab*)pVtab;
  sqlite3_free(p);
  return SQLITE_OK;
}

/*
** Constructor for a new ChangesSince cursors object.
*/
static int changesSinceOpen(sqlite3_vtab *p, sqlite3_vtab_cursor **ppCursor){
  cfsql_ChangesSince_cursor *pCur;
  pCur = sqlite3_malloc( sizeof(*pCur) );
  if( pCur==0 ) return SQLITE_NOMEM;
  memset(pCur, 0, sizeof(*pCur));
  *ppCursor = &pCur->base;
  return SQLITE_OK;
}

/*
** Destructor for a ChangesSince cursor.
*/
static int templatevtabClose(sqlite3_vtab_cursor *cur){
  cfsql_ChangesSince_cursor *pCur = (cfsql_ChangesSince_cursor*)cur;
  sqlite3_free(pCur);
  return SQLITE_OK;
}


/*
** Advance a ChangesSince_cursor to its next row of output.
*/
static int templatevtabNext(sqlite3_vtab_cursor *cur){
  cfsql_ChangesSince_cursor *pCur = (cfsql_ChangesSince_cursor*)cur;
  // here we call `step` on `changeSrc`
  // then, with what that gives us, populate 
  // pRowStmt
  // pCur->iRowid++;
  return SQLITE_OK;
}

/*
** Return values of columns for the row at which the templatevtab_cursor
** is currently pointing.
*/
static int changesSinceColumn(
  sqlite3_vtab_cursor *cur,   /* The cursor */
  sqlite3_context *ctx,       /* First argument to sqlite3_result_...() */
  int i                       /* Which column to return */
){
  cfsql_ChangesSince_cursor *pCur = (cfsql_ChangesSince_cursor*)cur;
  sqlite3_result_value(ctx, sqlite3_column_value(pCur->pRowStmt, i));
  return SQLITE_OK;
}

/*
** Return the rowid for the current row.  In this implementation, the
** rowid is the same as the output value.
*/
static int templatevtabRowid(sqlite3_vtab_cursor *cur, sqlite_int64 *pRowid){
  cfsql_ChangesSince_cursor *pCur = (cfsql_ChangesSince_cursor*)cur;
  // *pRowid = pCur->minv;
  return SQLITE_OK;
}

/*
** Return TRUE if the cursor has been moved off of the last
** row of output.
*/
static int changesSinceEof(sqlite3_vtab_cursor *cur){
  cfsql_ChangesSince_cursor *pCur = (cfsql_ChangesSince_cursor*)cur;
  return pCur->pChangeSrc == 0;
}

/*
** This method is called to "rewind" the templatevtab_cursor object back
** to the first row of output.  This method is always called at least
** once prior to any call to templatevtabColumn() or templatevtabRowid() or 
** templatevtabEof().
*/
static int templatevtabFilter(
  sqlite3_vtab_cursor *pVtabCursor, 
  int idxNum, const char *idxStr,
  int argc, sqlite3_value **argv
){
  // run our query here??
  // https://sqlite.org/src/file/ext/misc/unionvtab.c
  // templatevtab_cursor *pCur = (templatevtab_cursor *)pVtabCursor;
  // pCur->iRowid = 1;
  return SQLITE_OK;
}

/*
** SQLite will invoke this method one or more times while planning a query
** that uses the virtual table.  This routine needs to create
** a query plan for each invocation and compute an estimated cost for that
** plan.
*/
static int templatevtabBestIndex(
  sqlite3_vtab *tab,
  sqlite3_index_info *pIdxInfo
){
  pIdxInfo->estimatedCost = (double)10;
  pIdxInfo->estimatedRows = 10;
  return SQLITE_OK;
}

/*
** This following structure defines all the methods for the 
** virtual table.
*/
static sqlite3_module templatevtabModule = {
  /* iVersion    */ 0,
  /* xCreate     */ 0,
  /* xConnect    */ changesSinceConnect,
  /* xBestIndex  */ templatevtabBestIndex,
  /* xDisconnect */ changesSinceDisconnect,
  /* xDestroy    */ 0,
  /* xOpen       */ changesSinceOpen,
  /* xClose      */ templatevtabClose,
  /* xFilter     */ templatevtabFilter,
  /* xNext       */ templatevtabNext,
  /* xEof        */ changesSinceEof,
  /* xColumn     */ changesSinceColumn,
  /* xRowid      */ templatevtabRowid,
  /* xUpdate     */ 0,
  /* xBegin      */ 0,
  /* xSync       */ 0,
  /* xCommit     */ 0,
  /* xRollback   */ 0,
  /* xFindMethod */ 0,
  /* xRename     */ 0,
  /* xSavepoint  */ 0,
  /* xRelease    */ 0,
  /* xRollbackTo */ 0,
  /* xShadowName */ 0
};


// #ifdef _WIN32
// __declspec(dllexport)
// #endif
// int sqlite3_templatevtab_init(
//   sqlite3 *db, 
//   char **pzErrMsg, 
//   const sqlite3_api_routines *pApi
// ){
//   int rc = SQLITE_OK;
//   SQLITE_EXTENSION_INIT2(pApi);
//   rc = sqlite3_create_module(db, "templatevtab", &templatevtabModule, 0);
//   return rc;
// }