#include "sqlite3ext.h"
#include "storage.h"

#ifndef sqlite3_api
SQLITE_EXTENSION_INIT3
#endif

#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>
#include <ctype.h>

typedef struct crsqlite_vtab crsqlite_vtab;
struct crsqlite_vtab {
  sqlite3_vtab base;
  sqlite3 *db;            /* Database connection */

  int inTransaction;      /* True if within a transaction */
  char *vtabName;            /* Name of the virtual table */
  char *crTableName;       /* Name of the real cr table */
  int nCol;               /* Number of columns in the real table */
  int *aIndex;            /* Array of size nCol. True if column has an index */
  char **aCol;            /* Array of size nCol. Column names */
  sqlite3_uint64 vector;  /* Local vector, incremented when updating columns */

  //TODO: Store metadata relevant to a crsqlite virtual table
};

/*
** This function frees all runtime structures associated with the virtual
** table pVtab.
*/
static int free_vtab(sqlite3_vtab *pVtab){
  crsqlite_vtab *p = (crsqlite_vtab*)pVtab;
  sqlite3_free(p->aIndex);
  sqlite3_free(p->aCol);
  sqlite3_free(p->vtabName);
  sqlite3_free(p->crTableName);
  sqlite3_free(p);
  return SQLITE_OK;
}

/*
** This function is called to do the work of the xConnect() method -
** to allocate the required in-memory structures for a newly connected
** virtual table.
*/
static int create_crsqlite_vtab(
  sqlite3 *db,
  void *pAux,
  int argc, const char *const*argv,
  sqlite3_vtab **ppVtab,
  char **pzErr
){
  int rc = SQLITE_OK;
  int i;
  crsqlite_vtab *pVtab;

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
  pVtab->crTableName = sqlite3_mprintf("crsqlite_%s", argv[2]);

  if( rc==SQLITE_OK ){
    rc = get_column_names(db, pVtab->crTableName, &pVtab->aCol, &pVtab->nCol);
  }

  if( rc==SQLITE_OK ){
    rc = get_index_array(db, pVtab->crTableName, pVtab->nCol, &pVtab->aIndex);
  }


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


/* crsqlite_cursor is a subclass of sqlite3_vtab_cursor which will
** serve as the underlying representation of a cursor that scans
** over rows of the result
*/
typedef struct crsqlite_cursor crsqlite_cursor;
struct crsqlite_cursor {
  sqlite3_vtab_cursor base;  /* Base class - must be first */
  int iCursor;               /* Cursor number */
  sqlite3_int64 iRowid;      /* The rowid */
};

//Called by xConnect and xCreate to declare the vtab and initiate the vtab struct
static int declare_crsqlite_vtab(
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
  rc = create_crsqlite_vtab(db, pAux, argc, argv, ppVtab, pzErr);
  return rc;
}

/*
** The crsqliteCreate() method is invoked to create a new
** crsqlite_vtab that describes the crsqlite virtual table.
**
** Think of this routine as the constructor for crsqlite_vtab objects.
**
** All this routine needs to do is:
**
**    (1) Allocate the crsqlite_vtab object and initialize all fields.
**
**    (2) Tell SQLite (via the sqlite3_declare_vtab() interface) what the
**        result set of queries against crsqlite will look like.
*/
static int crsqliteCreate(
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

  rc = declare_crsqlite_vtab(db, pAux, argc, argv, ppVtab, pzErr);

  return rc;
}

//TODO:
static int crsqliteConnect(
  sqlite3 *db,
  void *pAux,
  int argc, const char *const*argv,
  sqlite3_vtab **ppVtab,
  char **pzErr
){
  return declare_crsqlite_vtab(db, pAux, argc, argv, ppVtab,  pzErr);
}


/*
** This method is the destructor for crsqlite_cursor objects.
*/
static int crsqliteDisconnect(sqlite3_vtab *pVtab){
  crsqlite_vtab *pTab = (crsqlite_vtab*)pVtab;


  sqlite3_free(pVtab);
  return SQLITE_OK;
}

/*
** This method is the destructor for crsqlite_cursor objects.
*/
static int crsqliteDestroy(sqlite3_vtab *pVtab){
  crsqlite_vtab *pTab = (crsqlite_vtab*)pVtab;
  sqlite3_free(pVtab);
  return SQLITE_OK;
}

/*
** Constructor for a new crsqlite_cursor object.
*/
static int crsqliteOpen(sqlite3_vtab *p, sqlite3_vtab_cursor **ppCursor){
  crsqlite_vtab *pTab = (crsqlite_vtab*)p;
  crsqlite_cursor *pCur;


  return SQLITE_OK;
}

/*
** Destructor for a crsqlite_cursor.
*/
static int crsqliteClose(sqlite3_vtab_cursor *cur){
  crsqlite_cursor *pCur = (crsqlite_cursor*)cur;
  crsqlite_vtab *pTab = (crsqlite_vtab*)cur->pVtab;


  sqlite3_free(cur);
  return SQLITE_OK;
}


/*
** Advance a crsqlite_cursor to its next row of output.
*/
static int crsqliteNext(sqlite3_vtab_cursor *cur){
  crsqlite_cursor *pCur = (crsqlite_cursor*)cur;
  crsqlite_vtab *pTab = (crsqlite_vtab*)cur->pVtab;


  return SQLITE_OK;
}

/*
** Return values of columns for the row at which the crsqlite_cursor
** is currently pointing.
*/
static int crsqliteColumn(
  sqlite3_vtab_cursor *cur,   /* The cursor */
  sqlite3_context *ctx,       /* First argument to sqlite3_result_...() */
  int i                       /* Which column to return */
){
  crsqlite_cursor *pCur = (crsqlite_cursor*)cur;
  crsqlite_vtab *pTab = (crsqlite_vtab*)cur->pVtab;

  return SQLITE_OK;
}

/*
** Return the rowid for the current row.  In this implementation, the
** rowid is the same as the output value.
*/
static int crsqliteRowid(sqlite3_vtab_cursor *cur, sqlite_int64 *pRowid){
  crsqlite_cursor *pCur = (crsqlite_cursor*)cur;
  crsqlite_vtab *pTab = (crsqlite_vtab*)cur->pVtab;


  return SQLITE_OK;
}

/*
** Return TRUE if the cursor has been moved off of the last
** row of output.
*/
static int crsqliteEof(sqlite3_vtab_cursor *cur){
  crsqlite_cursor *pCur = (crsqlite_cursor*)cur;
  crsqlite_vtab *pTab = (crsqlite_vtab*)cur->pVtab;


  return SQLITE_OK;
}

/*
** Output an sqlite3_value object's value as an SQL literal.
*/
static void crsqliteQuote(sqlite3_value *p){
  char z[50];
  switch( sqlite3_value_type(p) ){
    case SQLITE_NULL: {
      printf("NULL");
      break;
    }
    case SQLITE_INTEGER: {
      sqlite3_snprintf(50,z,"%lld", sqlite3_value_int64(p));
      printf("%s", z);
      break;
    }
    case SQLITE_FLOAT: {
      sqlite3_snprintf(50,z,"%!.20g", sqlite3_value_double(p));
      printf("%s", z);
      break;
    }
    case SQLITE_BLOB: {
      int n = sqlite3_value_bytes(p);
      const unsigned char *z = (const unsigned char*)sqlite3_value_blob(p);
      int i;
      printf("x'");
      for(i=0; i<n; i++) printf("%02x", z[i]);
      printf("'");
      break;
    }
    case SQLITE_TEXT: {
      const char *z = (const char*)sqlite3_value_text(p);
      int i;
      char c;
      for(i=0; (c = z[i])!=0 && c!='\''; i++){}
      if( c==0 ){
        printf("'%s'",z);
      }else{
        printf("'");
        while( *z ){
          for(i=0; (c = z[i])!=0 && c!='\''; i++){}
          if( c=='\'' ) i++;
          if( i ){
            printf("%.*s", i, z);
            z += i;
          }
          if( c=='\'' ){
            printf("'");
            continue;
          }
          if( c==0 ){
            break;
          }
          z++;
        }
        printf("'");
      }
      break;
    }
  }
}


/*
** This method is called to "rewind" the crsqlite_cursor object back
** to the first row of output.  This method is always called at least
** once prior to any call to crsqliteColumn() or crsqliteRowid() or 
** crsqliteEof().
*/
static int crsqliteFilter(
  sqlite3_vtab_cursor *cur,
  int idxNum, const char *idxStr,
  int argc, sqlite3_value **argv
){
  crsqlite_cursor *pCur = (crsqlite_cursor *)cur;
  crsqlite_vtab *pTab = (crsqlite_vtab*)cur->pVtab;


  return SQLITE_OK;
}

/*
** SQLite will invoke this method one or more times while planning a query
** that uses the crsqlite virtual table.  This routine needs to create
** a query plan for each invocation and compute an estimated cost for that
** plan.
*/
static int crsqliteBestIndex(
  sqlite3_vtab *tab,
  sqlite3_index_info *pIdxInfo
){
  crsqlite_vtab *pTab = (crsqlite_vtab*)tab;


  return SQLITE_OK;
}

/*
** SQLite invokes this method to INSERT, UPDATE, or DELETE content from
** the table. 
**
** This implementation does not actually make any changes to the table
** content.  It merely logs the fact that the method was invoked
*/
static int crsqliteUpdate(
  sqlite3_vtab *tab,
  int argc,
  sqlite3_value **argv,
  sqlite_int64 *pRowid
){
  crsqlite_vtab *pTab = (crsqlite_vtab*)tab;


  return SQLITE_OK;
}


/*
** This following structure defines all the methods for the 
** crsqlite virtual table.
*/
static sqlite3_module crsqliteModule = {
  0,                         /* iVersion */
  crsqliteCreate,             /* xCreate */
  crsqliteConnect,            /* xConnect */
  crsqliteBestIndex,          /* xBestIndex */
  crsqliteDisconnect,         /* xDisconnect */
  crsqliteDestroy,            /* xDestroy */
  crsqliteOpen,               /* xOpen - open a cursor */
  crsqliteClose,              /* xClose - close a cursor */
  crsqliteFilter,             /* xFilter - configure scan constraints */
  crsqliteNext,               /* xNext - advance a cursor */
  crsqliteEof,                /* xEof - check for end of scan */
  crsqliteColumn,             /* xColumn - read data */
  crsqliteRowid,              /* xRowid - read data */
  crsqliteUpdate,             /* xUpdate */
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

int init_crsqlite_vtab(
  sqlite3 *db,               /* SQLite connection to register module with */
  const char *zName,         /* Name of the module */
  void *pClientData          /* Client data for xCreate/xConnect */
){
  return sqlite3_create_module(db, "crsqlite", &crsqliteModule, pClientData);
}