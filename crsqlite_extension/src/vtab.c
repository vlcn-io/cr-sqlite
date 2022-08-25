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


/* crsqlite_vtab is a subclass of sqlite3_vtab which will
** serve as the underlying representation of a crsqlite virtual table
*/
typedef struct crsqlite_vtab crsqlite_vtab;
struct crsqlite_vtab {
  sqlite3_vtab base;  /* Base class - must be first */
  int nRow;           /* Number of rows in the table */
  int iInst;          /* Instance number for this crsqlite table */
  int nCursor;        /* Number of cursors created */
};

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
  //TODO: implement crsqlite_vtab object
  crsqlite_vtab *pNew;
  int i;
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

  rc = init_storage(db, argv[2], createTableString, pzErr);
  if (rc!=SQLITE_OK){
    *pzErr = "Initializing storage failed\n";
    sqlite3_free(createTableString);
    return rc;
  }
  
  char* declareSql = sqlite3_mprintf("CREATE TABLE sqliteIgnoresThisName(%s);", createTableString);
  sqlite3_free(createTableString);

  //printf("%s\n", declareSql);
  rc = sqlite3_declare_vtab(db, declareSql);
  sqlite3_free(declareSql);

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
  return SQLITE_OK;
}


/*
** This method is the destructor for crsqlite_cursor objects.
*/
static int crsqliteDisconnect(sqlite3_vtab *pVtab){
  crsqlite_vtab *pTab = (crsqlite_vtab*)pVtab;
  printf("crsqliteDisconnect(%d)\n", pTab->iInst);
  sqlite3_free(pVtab);
  return SQLITE_OK;
}

/*
** This method is the destructor for crsqlite_cursor objects.
*/
static int crsqliteDestroy(sqlite3_vtab *pVtab){
  crsqlite_vtab *pTab = (crsqlite_vtab*)pVtab;
  printf("crsqliteDestroy(%d)\n", pTab->iInst);
  sqlite3_free(pVtab);
  return SQLITE_OK;
}

/*
** Constructor for a new crsqlite_cursor object.
*/
static int crsqliteOpen(sqlite3_vtab *p, sqlite3_vtab_cursor **ppCursor){
  crsqlite_vtab *pTab = (crsqlite_vtab*)p;
  crsqlite_cursor *pCur;
  printf("crsqliteOpen(tab=%d, cursor=%d)\n", pTab->iInst, ++pTab->nCursor);
  pCur = sqlite3_malloc( sizeof(*pCur) );
  if( pCur==0 ) return SQLITE_NOMEM;
  memset(pCur, 0, sizeof(*pCur));
  pCur->iCursor = pTab->nCursor;
  *ppCursor = &pCur->base;
  return SQLITE_OK;
}

/*
** Destructor for a crsqlite_cursor.
*/
static int crsqliteClose(sqlite3_vtab_cursor *cur){
  crsqlite_cursor *pCur = (crsqlite_cursor*)cur;
  crsqlite_vtab *pTab = (crsqlite_vtab*)cur->pVtab;
  printf("crsqliteClose(tab=%d, cursor=%d)\n", pTab->iInst, pCur->iCursor);
  sqlite3_free(cur);
  return SQLITE_OK;
}


/*
** Advance a crsqlite_cursor to its next row of output.
*/
static int crsqliteNext(sqlite3_vtab_cursor *cur){
  crsqlite_cursor *pCur = (crsqlite_cursor*)cur;
  crsqlite_vtab *pTab = (crsqlite_vtab*)cur->pVtab;
  printf("crsqliteNext(tab=%d, cursor=%d)  rowid %d -> %d\n", 
         pTab->iInst, pCur->iCursor, (int)pCur->iRowid, (int)pCur->iRowid+1);
  pCur->iRowid++;
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
  char zVal[50];

  if( i<26 ){
    sqlite3_snprintf(sizeof(zVal),zVal,"%c%d", 
                     "abcdefghijklmnopqrstuvwyz"[i], pCur->iRowid);
  }else{
    sqlite3_snprintf(sizeof(zVal),zVal,"{%d}%d", i, pCur->iRowid);
  }
  printf("crsqliteColumn(tab=%d, cursor=%d, i=%d): [%s]\n",
         pTab->iInst, pCur->iCursor, i, zVal);
  sqlite3_result_text(ctx, zVal, -1, SQLITE_TRANSIENT);
  return SQLITE_OK;
}

/*
** Return the rowid for the current row.  In this implementation, the
** rowid is the same as the output value.
*/
static int crsqliteRowid(sqlite3_vtab_cursor *cur, sqlite_int64 *pRowid){
  crsqlite_cursor *pCur = (crsqlite_cursor*)cur;
  crsqlite_vtab *pTab = (crsqlite_vtab*)cur->pVtab;
  printf("crsqliteRowid(tab=%d, cursor=%d): %d\n",
         pTab->iInst, pCur->iCursor, (int)pCur->iRowid);
  *pRowid = pCur->iRowid;
  return SQLITE_OK;
}

/*
** Return TRUE if the cursor has been moved off of the last
** row of output.
*/
static int crsqliteEof(sqlite3_vtab_cursor *cur){
  crsqlite_cursor *pCur = (crsqlite_cursor*)cur;
  crsqlite_vtab *pTab = (crsqlite_vtab*)cur->pVtab;
  int rc = pCur->iRowid >= pTab->nRow;
  printf("crsqliteEof(tab=%d, cursor=%d): %d\n",
         pTab->iInst, pCur->iCursor, rc);
  return rc;
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
  printf("crsqliteFilter(tab=%d, cursor=%d):\n", pTab->iInst, pCur->iCursor);
  pCur->iRowid = 0;
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
  printf("crsqliteBestIndex(tab=%d):\n", pTab->iInst);
  pIdxInfo->estimatedCost = (double)500;
  pIdxInfo->estimatedRows = 500;
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
  int i;
  printf("crsqliteUpdate(tab=%d):\n", pTab->iInst);
  printf("  argc=%d\n", argc);
  for(i=0; i<argc; i++){
    printf("  argv[%d]=", i);
    crsqliteQuote(argv[i]);
    printf("\n");
  }
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