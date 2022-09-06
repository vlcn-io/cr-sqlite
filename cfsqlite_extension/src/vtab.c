#include "sqlite3ext.h"
#include "storage.h"
#include "vtab.h"

#ifndef sqlite3_api
SQLITE_EXTENSION_INIT3
#endif

#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>
#include <ctype.h>


typedef struct cf_column cf_column;
struct cf_column {
  char *name;
  char *default_value;
  int isPk;
  int isIndex;
};

typedef struct cfsqlite_vtab cfsqlite_vtab;
struct cfsqlite_vtab {
  sqlite3_vtab base;
  sqlite3 *db;            /* Database connection */

  int inTransaction;      /* True if within a transaction */
  char *vtabName;            /* Name of the virtual table */
  char *crTableName;       /* Name of the real cr table */
  char *zInsert;          /* SQL statement to insert a new row into the crr table */
  sqlite3_uint64 vector;  /* Local vector, incremented when updating columns */

  int nCol; /* Number of columns in the virtual table */
  cf_column **columns; /* Columns in the virtual table */

  //TODO: Store metadata relevant to a cfsqlite virtual table
};


static int free_columns(int nCol, cf_column **columns){
  
  for (int i = 0; i < nCol; i++){
    if (columns[i]->name) sqlite3_free(columns[i]->name);
    if (columns[i]->default_value) sqlite3_free(columns[i]->name);
    sqlite3_free(columns[i]);
  }
  sqlite3_free(columns);

  return SQLITE_OK;
}


/*
** This function frees all runtime structures associated with the virtual
** table pVtab.
*/
static int free_vtab(sqlite3_vtab *pVtab){
  cfsqlite_vtab *p = (cfsqlite_vtab*)pVtab;
  sqlite3_free(p->vtabName);
  sqlite3_free(p->crTableName);
  free_columns(p->nCol, p->columns);
  sqlite3_free(p);
  return SQLITE_OK;
}

/* Allocates a set of columns in the cfsqlite_vtab structure */
int create_columns(cfsqlite_vtab *pVtab)
{
  char *zSql;
  sqlite3_stmt *pStmt = 0;
  int rc;

  //Get number of non-metadata columns
  zSql = sqlite3_mprintf("SELECT count(*) FROM pragma_table_info(%Q) WHERE name NOT LIKE 'cf@_@_%%' ESCAPE '@';", pVtab->crTableName);
  if( !zSql ) goto out;

  rc = sqlite3_prepare(pVtab->db, zSql, -1, &pStmt, 0);
  rc = sqlite3_step(pStmt);

  pVtab->nCol = sqlite3_column_int(pStmt, 0);
  pVtab->columns = sqlite3_malloc(sizeof(cf_column*)*pVtab->nCol);
  rc = sqlite3_finalize(pStmt);


  //Get info about each column
  zSql = sqlite3_mprintf("SELECT * FROM pragma_table_info(%Q) WHERE name NOT LIKE 'cf@_@_%%' ESCAPE '@';", pVtab->crTableName);
  if( !zSql ) goto out;
  rc = sqlite3_prepare(pVtab->db, zSql, -1, &pStmt, 0);

  int i = 0;
  while( sqlite3_step(pStmt)==SQLITE_ROW ){
    pVtab->columns[i] = sqlite3_malloc(sizeof(cf_column));
    pVtab->columns[i]->name = sqlite3_mprintf("%s", (char *)sqlite3_column_text(pStmt, COLUMN_NAME));
    pVtab->columns[i]->isPk = sqlite3_column_int(pStmt, COLUMN_PK);
    pVtab->columns[i]->default_value = sqlite3_mprintf("%s", (char *)sqlite3_column_text(pStmt, COLUMN_DFLT_VAL));
    i++;
  }
  rc = sqlite3_finalize(pStmt);

  //TODO: isIdx field on columns should be set;

  out:
  if (zSql) sqlite3_free(zSql);
  return rc;
}

//Build a string to insert a row into the CR layer table, like example:
  // INSERT INTO "todo_crr" (
  //   "cf__cl",
  //   "id",
  //   "cf__v_id",
  //   "value",
  //   "cf__v_value"
  // ) VALUES (
  //   1,
  //   ?1
  //   ?0,
  //   ?2,
  //   ?0"
  // ) ON CONFLICT DO UPDATE SET
  //   "cf__cl" = CASE WHEN "cf__cl" % 2 = 0 THEN "cf__cl" + 1 ELSE "cf__cl" END,
  //   "value" = EXCLUDED."value",
  //   "cf__v_value" = CASE WHEN EXCLUDED."value" != "value" THEN "cf__v_value" + 1 ELSE "cf__v_value" END;
char* create_insert_statement(
  cfsqlite_vtab *pVtab
){
  sqlite3_str * columns = sqlite3_str_new(NULL);
  sqlite3_str * values = sqlite3_str_new(NULL);
  sqlite3_str * update = sqlite3_str_new(NULL);

  sqlite3_str_appendf(columns, "INSERT INTO %Q ('cf__cl', ", pVtab->crTableName);
  sqlite3_str_appendall(values, ") VALUES ( 1, ");
  sqlite3_str_appendall(update, ") ON CONFLICT DO UPDATE SET 'cf__cl' = CASE WHEN 'cf__cl' % 2 = 0 THEN 'cf__cl' + 1 ELSE 'cf__cl' END, ");

  for (int i = 0 ; i < pVtab->nCol; i++){
    if (pVtab->columns[i]->isPk == 0){

      sqlite3_str_appendf(columns, "'%s', 'cf__v_%s'", pVtab->columns[i]->name, pVtab->columns[i]->name);
      sqlite3_str_appendf(values, "?%d, ?%d", i+1, pVtab->nCol+1);
      sqlite3_str_appendf(update, "'%s' = EXCLUDED.'%s', ", pVtab->columns[i]->name, pVtab->columns[i]->name);
      sqlite3_str_appendf(update, "'cf__v_%s' = CASE WHEN EXCLUDED.'%s' != '%s' THEN 'cf__v_%s' + 1 ELSE 'cf__v_%s' END"
        ,pVtab->columns[i]->name, pVtab->columns[i]->name, pVtab->columns[i]->name, pVtab->columns[i]->name, pVtab->columns[i]->name);

    } else {

      sqlite3_str_appendf(columns, "'%s'", pVtab->columns[i]->name);
      sqlite3_str_appendf(values, "?%d", i+1);

    }
    if (i != pVtab->nCol-1){

      sqlite3_str_appendall(columns, ", ");
      sqlite3_str_appendall(values, ", ");
      if (pVtab->columns[i]->isPk == 0) sqlite3_str_appendall(update, ", ");

    }
  }

  sqlite3_str_appendall(update, ";");
  sqlite3_str_appendall(columns, sqlite3_str_finish(values));
  sqlite3_str_appendall(columns, sqlite3_str_finish(update));

  return sqlite3_str_finish(columns);
}

/*
** This function is called to do the work of the xConnect() method -
** to allocate the required in-memory structures for a newly connected
** virtual table.
*/
static int create_cfsqlite_vtab(
  sqlite3 *db,
  void *pAux,
  int argc, const char *const*argv,
  sqlite3_vtab **ppVtab,
  char **pzErr
){
  int rc = SQLITE_OK;
  int i;
  cfsqlite_vtab *pVtab;

  /* Allocate the sqlite3_vtab/echo_vtab structure itself */
  pVtab = sqlite3_malloc( sizeof(*pVtab) );
  if( !pVtab ){
    return SQLITE_NOMEM;
  }
  pVtab->db = db;

  /* Allocate echo_vtab.zThis */
  pVtab->vtabName = sqlite3_mprintf("%s", argv[2]);
  if( !pVtab->vtabName ){
    free_vtab((sqlite3_vtab *)pVtab);
    return SQLITE_NOMEM;
  }

  /* Allocate echo_vtab.zTableName */
  pVtab->crTableName = sqlite3_mprintf("cfsqlite_%s", argv[2]);

  rc = create_columns(pVtab);

  pVtab->zInsert = create_insert_statement(pVtab);
  // printf("%s\n", pVtab->zInsert);


  if( rc!=SQLITE_OK ){
    free_vtab((sqlite3_vtab *)pVtab);
    return rc;
  }

  /* Set starting values for vector */
  pVtab->vector = 1;

  /* Success. Set *ppVtab and return */
  *ppVtab = &pVtab->base;

  return SQLITE_OK;
}


/* cfsqlite_cursor is a subclass of sqlite3_vtab_cursor which will
** serve as the underlying representation of a cursor that scans
** over rows of the result
*/
typedef struct cfsqlite_cursor cfsqlite_cursor;
struct cfsqlite_cursor {
  sqlite3_vtab_cursor base;  /* Base class - must be first */
  int iCursor;               /* Cursor number */
  sqlite3_int64 iRowid;      /* The rowid */
};

//Called by xConnect and xCreate to declare the vtab and initiate the vtab struct
static int declare_cfsqlite_vtab(
  sqlite3 *db,
  void *pAux,
  int argc, const char *const*argv,
  sqlite3_vtab **ppVtab,
  char **pzErr
){
  int rc;

  //Create comma seperated list of arguments
  sqlite3_str* createTableArgs = sqlite3_str_new(NULL);
  for(int i = 3; i < argc; i++){
    sqlite3_str_appendall(createTableArgs, argv[i]);
    if (i != argc -1){
      sqlite3_str_appendall(createTableArgs, ", ");
    }
  }

  char *createTableString = sqlite3_str_finish(createTableArgs);
  char* declareSql = sqlite3_mprintf("CREATE TABLE sqliteIgnoresThisName(%s);", createTableString);
  sqlite3_free(createTableString);
  
  //printf("%s\n", declareSql);
  rc = sqlite3_declare_vtab(db, declareSql);
  sqlite3_free(declareSql);


  //Create vtab object in memory
  rc = create_cfsqlite_vtab(db, pAux, argc, argv, ppVtab, pzErr);
  return rc;
}

/*
** The cfsqliteCreate() method is invoked to create a new
** cfsqlite_vtab that describes the cfsqlite virtual table.
**
** Think of this routine as the constructor for cfsqlite_vtab objects.
**
** All this routine needs to do is:
**
**    (1) Allocate the cfsqlite_vtab object and initialize all fields.
**
**    (2) Tell SQLite (via the sqlite3_declare_vtab() interface) what the
**        result set of queries against cfsqlite will look like.
*/
static int cfsqliteCreate(
  sqlite3 *db,
  void *pAux,
  int argc, const char *const*argv,
  sqlite3_vtab **ppVtab,
  char **pzErr
){
  int rc;

  rc = init_storage(db, argc, argv, pzErr);
  if (rc!=SQLITE_OK){
    *pzErr = "Initializing storage failed\n";
    return rc;
  }

  rc = declare_cfsqlite_vtab(db, pAux, argc, argv, ppVtab, pzErr);

  return rc;
}

//TODO:
static int cfsqliteConnect(
  sqlite3 *db,
  void *pAux,
  int argc, const char *const*argv,
  sqlite3_vtab **ppVtab,
  char **pzErr
){
  return declare_cfsqlite_vtab(db, pAux, argc, argv, ppVtab,  pzErr);
}


/*
** This method is the destructor for cfsqlite_cursor objects.
*/
static int cfsqliteDisconnect(sqlite3_vtab *pVtab){
  cfsqlite_vtab *pTab = (cfsqlite_vtab*)pVtab;
  sqlite3_free(pVtab);
  return SQLITE_OK;
}

/*
** This method is the destructor for cfsqlite_cursor objects.
*/
static int cfsqliteDestroy(sqlite3_vtab *pVtab){
  cfsqlite_vtab *pTab = (cfsqlite_vtab*)pVtab;  
  sqlite3_free(pVtab);
  return SQLITE_OK;
}

/*
** Constructor for a new cfsqlite_cursor object.
*/
static int cfsqliteOpen(sqlite3_vtab *p, sqlite3_vtab_cursor **ppCursor){
  cfsqlite_vtab *pTab = (cfsqlite_vtab*)p;
  cfsqlite_cursor *pCur;


  return SQLITE_OK;
}

/*
** Destructor for a cfsqlite_cursor.
*/
static int cfsqliteClose(sqlite3_vtab_cursor *cur){
  cfsqlite_cursor *pCur = (cfsqlite_cursor*)cur;
  cfsqlite_vtab *pTab = (cfsqlite_vtab*)cur->pVtab;


  sqlite3_free(cur);
  return SQLITE_OK;
}


/*
** Advance a cfsqlite_cursor to its next row of output.
*/
static int cfsqliteNext(sqlite3_vtab_cursor *cur){
  cfsqlite_cursor *pCur = (cfsqlite_cursor*)cur;
  cfsqlite_vtab *pTab = (cfsqlite_vtab*)cur->pVtab;


  return SQLITE_OK;
}

/*
** Return values of columns for the row at which the cfsqlite_cursor
** is currently pointing.
*/
static int cfsqliteColumn(
  sqlite3_vtab_cursor *cur,   /* The cursor */
  sqlite3_context *ctx,       /* First argument to sqlite3_result_...() */
  int i                       /* Which column to return */
){
  cfsqlite_cursor *pCur = (cfsqlite_cursor*)cur;
  cfsqlite_vtab *pTab = (cfsqlite_vtab*)cur->pVtab;

  return SQLITE_OK;
}

/*
** Return the rowid for the current row.  In this implementation, the
** rowid is the same as the output value.
*/
static int cfsqliteRowid(sqlite3_vtab_cursor *cur, sqlite_int64 *pRowid){
  cfsqlite_cursor *pCur = (cfsqlite_cursor*)cur;
  cfsqlite_vtab *pTab = (cfsqlite_vtab*)cur->pVtab;


  return SQLITE_OK;
}

/*
** Return TRUE if the cursor has been moved off of the last
** row of output.
*/
static int cfsqliteEof(sqlite3_vtab_cursor *cur){
  cfsqlite_cursor *pCur = (cfsqlite_cursor*)cur;
  cfsqlite_vtab *pTab = (cfsqlite_vtab*)cur->pVtab;


  return SQLITE_OK;
}


/*
** This method is called to "rewind" the cfsqlite_cursor object back
** to the first row of output.  This method is always called at least
** once prior to any call to cfsqliteColumn() or cfsqliteRowid() or 
** cfsqliteEof().
*/
static int cfsqliteFilter(
  sqlite3_vtab_cursor *cur,
  int idxNum, const char *idxStr,
  int argc, sqlite3_value **argv
){
  cfsqlite_cursor *pCur = (cfsqlite_cursor *)cur;
  cfsqlite_vtab *pTab = (cfsqlite_vtab*)cur->pVtab;


  return SQLITE_OK;
}

/*
** SQLite will invoke this method one or more times while planning a query
** that uses the cfsqlite virtual table.  This routine needs to create
** a query plan for each invocation and compute an estimated cost for that
** plan.
*/
static int cfsqliteBestIndex(
  sqlite3_vtab *tab,
  sqlite3_index_info *pIdxInfo
){
  cfsqlite_vtab *pTab = (cfsqlite_vtab*)tab;


  return SQLITE_OK;
}

/*
** SQLite invokes this method to INSERT, UPDATE, or DELETE content from
** the table. 
** The xUpdate method for the virtual table.
** 
**    apData[0]  apData[1]  apData[2..]
**
**    INTEGER                              DELETE            
**
**    INTEGER    NULL       (nCol args)    UPDATE (do not set rowid)
**    INTEGER    INTEGER    (nCol args)    UPDATE (with SET rowid = <arg1>) <- This is an illegal operation
**
**    NULL       NULL       (nCol args)    INSERT INTO (automatic rowid value)
**    NULL       INTEGER    (nCol args)    INSERT (incl. rowid value)
**
*/
static int cfsqliteUpdate(
  sqlite3_vtab *tab,
  int nData, 
  sqlite3_value **apData, 
  sqlite_int64 *pRowid
){
  cfsqlite_vtab *pVtab = (cfsqlite_vtab*)tab;
  sqlite3 *db = pVtab->db;
  int rc = SQLITE_OK;


  sqlite3_stmt *pStmt = 0;
  char *zSql = 0;               /* SQL statement to execute */


  /* If apData[0] is an integer and nData>1 then do an UPDATE */

  /* If apData[0] is an integer and nData==1 then do a DELETE */

  /* If the first argument is NULL and there are more than two args, INSERT */
  if( nData>2 && sqlite3_value_type(apData[0])==SQLITE_NULL ){
    zSql = pVtab->zInsert;
  }

  rc = sqlite3_prepare(db, zSql, -1, &pStmt, 0);

  if( rc==SQLITE_OK ) {
    sqlite3_bind_int(pStmt, pVtab->nCol+1, pVtab->vector);

    for(int i=2; i<nData && rc==SQLITE_OK; i++){
      if( apData[i] ) rc = sqlite3_bind_value(pStmt, i-1, apData[i]);
    }
    if( rc==SQLITE_OK ){
      sqlite3_step(pStmt);
      rc = sqlite3_finalize(pStmt);
    }else{
      sqlite3_finalize(pStmt);
    }
  }

  if( pRowid && rc==SQLITE_OK ){
    *pRowid = sqlite3_last_insert_rowid(db);
  }
  if( rc!=SQLITE_OK ){
    tab->zErrMsg = sqlite3_mprintf("cfsqlite-vtab-error: %s", sqlite3_errmsg(db));
  } else {
    pVtab->vector++;
  }

  return rc;
}

/*
** This following structure defines all the methods for the 
** cfsqlite virtual table.
*/
static sqlite3_module cfsqliteModule = {
  0,                         /* iVersion */
  cfsqliteCreate,             /* xCreate */
  cfsqliteConnect,            /* xConnect */
  cfsqliteBestIndex,          /* xBestIndex */
  cfsqliteDisconnect,         /* xDisconnect */
  cfsqliteDestroy,            /* xDestroy */
  cfsqliteOpen,               /* xOpen - open a cursor */
  cfsqliteClose,              /* xClose - close a cursor */
  cfsqliteFilter,             /* xFilter - configure scan constraints */
  cfsqliteNext,               /* xNext - advance a cursor */
  cfsqliteEof,                /* xEof - check for end of scan */
  cfsqliteColumn,             /* xColumn - read data */
  cfsqliteRowid,              /* xRowid - read data */
  cfsqliteUpdate,             /* xUpdate */
  0,                         /* xBegin */
  0,                         /* xSync */
  0,                         /* xCommit */
  0,                         /* xRollback */
  0,                         /* xFindMethod */
  0,                         /* xRename */
  0,                         /* xSavepoint */
  0,                         /* xRelease */
  0,                         /* xRollbackTo */
  0,                         /* xShadowName */
};

int init_cfsqlite_vtab(
  sqlite3 *db,               /* SQLite connection to register module with */
  const char *zName,         /* Name of the module */
  void *pClientData          /* Client data for xCreate/xConnect */
){
  return sqlite3_create_module(db, "cfsqlite", &cfsqliteModule, pClientData);
}