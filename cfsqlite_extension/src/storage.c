#include <stdio.h>
#include <string.h>
#include <stdarg.h>
#include <assert.h>

#include <sqlite3ext.h>

#ifndef sqlite3_api
SQLITE_EXTENSION_INIT3
#endif


/*
** Retrieve the column names for the table named zTab via database
** connection db. SQLITE_OK is returned on success, or an sqlite error
** code otherwise.
**
** If successful, the number of columns is written to *pnCol. *paCol is
** set to point at sqlite3_malloc()'d space containing the array of
** nCol column names. The caller is responsible for calling sqlite3_free
** on *paCol.
*/
int get_column_names(
  sqlite3 *db, 
  const char *zTab,
  char ***paCol, 
  int *pnCol
){
  char **aCol = 0;
  char *zSql;
  sqlite3_stmt *pStmt = 0;
  int rc = SQLITE_OK;
  int nCol = 0;

  /* Prepare the statement "SELECT * FROM <tbl>". The column names
  ** of the result set of the compiled SELECT will be the same as
  ** the column names of table <tbl>.
  */
  zSql = sqlite3_mprintf("SELECT * FROM %Q", zTab);
  if( !zSql ){
    rc = SQLITE_NOMEM;
    goto out;
  }
  rc = sqlite3_prepare(db, zSql, -1, &pStmt, 0);

  sqlite3_free(zSql);

  if( rc==SQLITE_OK ){
    int ii;
    int nBytes;
    char *zSpace;
    nCol = sqlite3_column_count(pStmt);

    /* Figure out how much space to allocate for the array of column names 
    ** (including space for the strings themselves). Then allocate it.
    */
    nBytes = sizeof(char *) * nCol;
    for(ii=0; ii<nCol; ii++){
      const char *zName = sqlite3_column_name(pStmt, ii);
      if( !zName ){
        rc = SQLITE_NOMEM;
        goto out;
      }
      nBytes += (int)strlen(zName)+1;
    }
    aCol = (char **)sqlite3_malloc(nBytes);
    if( !aCol ){
      rc = SQLITE_NOMEM;
      goto out;
    }

    /* Copy the column names into the allocated space and set up the
    ** pointers in the aCol[] array.
    */
    zSpace = (char *)(&aCol[nCol]);
    for(ii=0; ii<nCol; ii++){
      const char *zName = sqlite3_column_name(pStmt, ii);
        aCol[ii] = zSpace;
        sqlite3_snprintf(nBytes, zSpace, "%s", zName);
        zSpace += (int)strlen(zSpace) + 1;
    
    }
    assert( (zSpace-nBytes)==(char *)aCol );
  }

  *paCol = aCol;
  *pnCol = nCol;

out:
  sqlite3_finalize(pStmt);
  return rc;
}

/*
** Parameter zTab is the name of a table in database db with nCol 
** columns. This function allocates an array of integers nCol in 
** size and populates it according to any implicit or explicit 
** indices on table zTab.
**
** If successful, SQLITE_OK is returned and *paIndex set to point 
** at the allocated array. Otherwise, an error code is returned.
**
** See comments associated with the member variable aIndex above 
** "struct echo_vtab" for details of the contents of the array.
*/
int get_index_array(
  sqlite3 *db,             /* Database connection */
  const char *zTab,        /* Name of table in database db */
  int nCol,
  int **paIndex
){
  sqlite3_stmt *pStmt = 0;
  int *aIndex = 0;
  int rc;
  char *zSql;

  /* Allocate space for the index array */
  aIndex = (int *)sqlite3_malloc(sizeof(int*) * nCol);
  if( !aIndex ){
    rc = SQLITE_NOMEM;
    goto get_index_array_out;
  }

  /* Compile an sqlite pragma to loop through all indices on table zTab */
  zSql = sqlite3_mprintf("PRAGMA index_list(%s)", zTab);

  if( !zSql ){
    rc = SQLITE_NOMEM;
    goto get_index_array_out;
  }
  rc = sqlite3_prepare(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  /* For each index, figure out the left-most column and set the 
  ** corresponding entry in aIndex[] to 1.
  */
  while( pStmt && sqlite3_step(pStmt)==SQLITE_ROW ){
    const char *zIdx = (const char *)sqlite3_column_text(pStmt, 1);
    sqlite3_stmt *pStmt2 = 0;
    if( zIdx==0 ) continue;
    zSql = sqlite3_mprintf("PRAGMA index_info(%s)", zIdx);
    if( !zSql ){
      rc = SQLITE_NOMEM;
      goto get_index_array_out;
    }
    rc = sqlite3_prepare(db, zSql, -1, &pStmt2, 0);
    sqlite3_free(zSql);
    if( pStmt2 && sqlite3_step(pStmt2)==SQLITE_ROW ){
      int cid = sqlite3_column_int(pStmt2, 1);
      assert( cid>=0 && cid<nCol );
      aIndex[cid] = 1;
    }
    if( pStmt2 ){
      rc = sqlite3_finalize(pStmt2);
    }
    if( rc!=SQLITE_OK ){
      goto get_index_array_out;
    }
  }


get_index_array_out:
  if( pStmt ){
    int rc2 = sqlite3_finalize(pStmt);
    if( rc==SQLITE_OK ){
      rc = rc2;
    }
  }
  if( rc!=SQLITE_OK ){
    sqlite3_free(aIndex);
    aIndex = 0;
  }
  *paIndex = aIndex;
  return rc;
}



 /*
** Construct one or more SQL statements from the format string given
** and then evaluate those statements. The success code is written
** into *pRc.
**
** If *pRc is initially non-zero then this routine is a no-op.
*/
static void storage_db_exec(
  int *pRc,              /* Success code */
  sqlite3 *db,           /* Database in which to run SQL */
  const char *zFormat,   /* Format string for SQL */
  ...                    /* Arguments to the format string */
){
  va_list ap;
  char *zSql;
  if( *pRc != SQLITE_OK ) return;
  va_start(ap, zFormat);
  zSql = sqlite3_vmprintf(zFormat, ap);
  //printf("Executing SQL statement: %s\n", zSql);
  va_end(ap);
  if( zSql==0 ){
    *pRc = SQLITE_NOMEM;
    
  }else{
    *pRc = sqlite3_exec(db, zSql, 0, 0, 0);
    sqlite3_free(zSql);
  }
}

int column_is_constraint(
  const char* column
){
  if(( (strcasecmp(column, "PRIMARY") == 0) 
    || (strcasecmp(column, "UNIQUE") == 0) 
    || (strcasecmp(column, "CHECK") == 0) 
    || (strcasecmp(column, "FOREIGN") == 0))){
      return 1;
  }

  return 0;
}


/* Initites the real database table(s) that backs the virtual table*/
int init_storage(
  sqlite3 *db,
  int argc, const char *const*argv,
  char **pzErr
)
{
  
  //Create the crtable schema
  char *nameOnly;
  char *rowCopy;
  int constraintRowIdx = 0;

  //Create comma seperated string of arguments, for each column that is not a primary key, add a vector column aswell
  sqlite3_str* createTableArgs = sqlite3_str_new(NULL);
  sqlite3_str_appendall(createTableArgs, "cf__cl INTEGER, ");
  for(int i = 3; i < argc; i++){
    //Get the first part of the argument, the name of the column
    rowCopy = sqlite3_mprintf("%s", argv[i]);
    nameOnly = strtok(rowCopy, " ");

    //Check if name is actually a name, or the start of a constraint
    if(column_is_constraint(nameOnly) == 0){
      sqlite3_str_appendf(createTableArgs, "%s, cf__v_%s INTEGER", argv[i], nameOnly);
    } else
    {
      //For now we add all constraints in the future this will probably not be the case
      sqlite3_str_appendall(createTableArgs, argv[i]);
    } 

    if (i != argc -1){
      sqlite3_str_appendall(createTableArgs, ", ");
    }
  }

  char *createTableString = sqlite3_str_finish(createTableArgs);
  sqlite3_free(rowCopy);

  int rc = SQLITE_OK;
  storage_db_exec(&rc, db, "CREATE TABLE cfsqlite_%s(%s);", argv[2], createTableString);
  if (rc != SQLITE_OK){
    fprintf(stderr,"Error creating table: %s\n", argv[2]);
  }

  return rc;
}