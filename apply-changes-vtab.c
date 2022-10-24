#include "apply-changes-vtab.h"
#include <string.h>
#include <assert.h>
#include "consts.h"
#include "util.h"

/**
 * apply changes syntax:
 * 
 * insert into crsql_apply_changes table, pks, colvals, colversions, site_id VALUES(...)
 * 
 * where `pks` are quote-concated
 * `colvals` are quote-concated in order of col-versions
 * `col-versions` are... json keyed by cid :|
 * `site-id` site id blob? or quoted str?
 * 
 * `version` is omittable?
 * 
 * Soo.. technically we can use the `changes since` vtab and just
 * add an update method?
 */

/* crsql_applyChanges_vtab is a subclass of sqlite3_vtab which is
** underlying representation of the virtual table
*/
typedef struct crsql_applyChanges_vtab crsql_applyChanges_vtab;
struct crsql_applyChanges_vtab {
  sqlite3_vtab base;  /* Base class - must be first */
  sqlite3 *db;
};

/* crsql_applyChanges_cursor is a subclass of sqlite3_vtab_cursor which will
** serve as the underlying representation of a cursor that scans
** over rows of the result
*/
typedef struct crsql_applyChanges_cursor crsql_applyChanges_cursor;
struct crsql_applyChanges_cursor {
  sqlite3_vtab_cursor base;  /* Base class - must be first */
  /* Insert new fields here.  For this crsql_applyChanges we only keep track
  ** of the rowid */
  sqlite3_int64 iRowid;      /* The rowid */
};

/*
** The crsql_applyChangesConnect() method is invoked to create a new
** template virtual table.
**
** Think of this routine as the constructor for crsql_applyChanges_vtab objects.
**
** All this routine needs to do is:
**
**    (1) Allocate the crsql_applyChanges_vtab object and initialize all fields.
**
**    (2) Tell SQLite (via the sqlite3_declare_vtab() interface) what the
**        result set of queries against the virtual table will look like.
*/
static int applyChangesConnect(
  sqlite3 *db,
  void *pAux,
  int argc, const char *const*argv,
  sqlite3_vtab **ppVtab,
  char **pzErr
){
  crsql_applyChanges_vtab *pNew;
  int rc;

  rc = sqlite3_declare_vtab(db,
           "CREATE TABLE x(a,b)"
       );
  /* For convenience, define symbolic names for the index to each column. */
#define crsql_applyChanges_A  0
#define crsql_applyChanges_B  1
  if( rc==SQLITE_OK ){
    pNew = sqlite3_malloc( sizeof(*pNew) );
    *ppVtab = (sqlite3_vtab*)pNew;
    if( pNew==0 ) return SQLITE_NOMEM;
    memset(pNew, 0, sizeof(*pNew));
  }
  return rc;
}

/*
** This method is the destructor for crsql_applyChanges_vtab objects.
*/
static int applyChangesDisconnect(sqlite3_vtab *pVtab){
  crsql_applyChanges_vtab *p = (crsql_applyChanges_vtab*)pVtab;
  sqlite3_free(p);
  return SQLITE_OK;
}

/*
** Constructor for a new crsql_applyChanges_cursor object.
*/
static int applyChangesOpen(sqlite3_vtab *p, sqlite3_vtab_cursor **ppCursor){
  crsql_applyChanges_cursor *pCur;
  pCur = sqlite3_malloc( sizeof(*pCur) );
  if( pCur==0 ) return SQLITE_NOMEM;
  memset(pCur, 0, sizeof(*pCur));
  *ppCursor = &pCur->base;
  return SQLITE_OK;
}

/*
** Destructor for a crsql_applyChanges_cursor.
*/
static int applyChangesClose(sqlite3_vtab_cursor *cur){
  crsql_applyChanges_cursor *pCur = (crsql_applyChanges_cursor*)cur;
  sqlite3_free(pCur);
  return SQLITE_OK;
}


/*
** Advance a crsql_applyChanges_cursor to its next row of output.
*/
static int applyChangesNext(sqlite3_vtab_cursor *cur){
  crsql_applyChanges_cursor *pCur = (crsql_applyChanges_cursor*)cur;
  pCur->iRowid++;
  return SQLITE_OK;
}

/*
** Return values of columns for the row at which the crsql_applyChanges_cursor
** is currently pointing.
*/
static int applyChangesColumn(
  sqlite3_vtab_cursor *cur,   /* The cursor */
  sqlite3_context *ctx,       /* First argument to sqlite3_result_...() */
  int i                       /* Which column to return */
){
  crsql_applyChanges_cursor *pCur = (crsql_applyChanges_cursor*)cur;
  switch( i ){
    case crsql_applyChanges_A:
      sqlite3_result_int(ctx, 1000 + pCur->iRowid);
      break;
    default:
      assert( i==crsql_applyChanges_B );
      sqlite3_result_int(ctx, 2000 + pCur->iRowid);
      break;
  }
  return SQLITE_OK;
}

/*
** Return the rowid for the current row.  In this implementation, the
** rowid is the same as the output value.
*/
static int applyChangesRowid(sqlite3_vtab_cursor *cur, sqlite_int64 *pRowid){
  crsql_applyChanges_cursor *pCur = (crsql_applyChanges_cursor*)cur;
  *pRowid = pCur->iRowid;
  return SQLITE_OK;
}

/*
** Return TRUE if the cursor has been moved off of the last
** row of output.
*/
static int applyChangesEof(sqlite3_vtab_cursor *cur){
  crsql_applyChanges_cursor *pCur = (crsql_applyChanges_cursor*)cur;
  return pCur->iRowid>=10;
}

/*
** This method is called to "rewind" the crsql_applyChanges_cursor object back
** to the first row of output.  This method is always called at least
** once prior to any call to crsql_applyChangesColumn() or crsql_applyChangesRowid() or 
** crsql_applyChangesEof().
*/
static int applyChangesFilter(
  sqlite3_vtab_cursor *pVtabCursor, 
  int idxNum, const char *idxStr,
  int argc, sqlite3_value **argv
){
  crsql_applyChanges_cursor *pCur = (crsql_applyChanges_cursor *)pVtabCursor;
  pCur->iRowid = 1;
  return SQLITE_OK;
}

/*
** SQLite will invoke this method one or more times while planning a query
** that uses the virtual table.  This routine needs to create
** a query plan for each invocation and compute an estimated cost for that
** plan.
*/
static int applyChangesBestIndex(
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
static sqlite3_module crsql_applyChangesModule = {
  /* iVersion    */ 0,
  /* xCreate     */ 0,
  /* xConnect    */ applyChangesConnect,
  /* xBestIndex  */ applyChangesBestIndex, // since insert will take where
  /* xDisconnect */ applyChangesDisconnect,
  /* xDestroy    */ 0,
  /* xOpen       */ applyChangesOpen,
  /* xClose      */ applyChangesClose,
  /* xFilter     */ applyChangesFilter,
  /* xNext       */ applyChangesNext,
  /* xEof        */ applyChangesEof,
  /* xColumn     */ applyChangesColumn,
  /* xRowid      */ applyChangesRowid,
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
