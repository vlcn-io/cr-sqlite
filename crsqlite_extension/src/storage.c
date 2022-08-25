#include <stdio.h>
#include <string.h>
#include <stdarg.h>

#include <sqlite3ext.h>

#ifndef sqlite3_api
SQLITE_EXTENSION_INIT3
#endif

#define COLUMN_NAME 1
#define COLUMN_TYPE 2
#define COLUMN_NOT_NULL 3
#define COLUMN_DFLT_VAL 4
#define COLUMN_PK 5

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


/* Initites the real database table(s) that backs the virtual table*/
int init_storage(
  sqlite3 *db,
  const char* ttbl,
  const char* createTableArgs,
  char **pzErr
)
{
  
  //Create the table with "normal" schema
  int rc = SQLITE_OK;
  storage_db_exec(&rc, db, "CREATE TABLE crsqlite_%s(%s);", ttbl, createTableArgs);
  if (rc != SQLITE_OK){
    fprintf(stderr,"Error creating table: %s\n", ttbl);
    return rc;
  }

  char *crsqliteTableName = sqlite3_mprintf("crsqlite_%s", ttbl);
  if (crsqliteTableName == NULL) return SQLITE_NOMEM;
  char *zSql = sqlite3_mprintf("PRAGMA table_info('%s');", crsqliteTableName);
  if (zSql == NULL) return SQLITE_NOMEM;
  sqlite3_stmt *pStmt = 0;
  rc = sqlite3_prepare(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  //Excute table_info pragma on table:
  // - For each column in the crr table that is not primary key, add a vector column to the schema
  while( pStmt && sqlite3_step(pStmt)==SQLITE_ROW ){

    const char *columnName = (const char *)sqlite3_column_text(pStmt, COLUMN_NAME);
    int primaryKey = sqlite3_column_int(pStmt, COLUMN_PK);
    if( columnName==0) break;

    if (primaryKey == 0){
      storage_db_exec(&rc, db, "ALTER TABLE %s ADD COLUMN v_%s INTEGER;", crsqliteTableName, columnName);
      if (rc!=SQLITE_OK) break;
    }

    if( rc!=SQLITE_OK ){
      break;
    }
  }


  if( pStmt ){
    int rc2 = sqlite3_finalize(pStmt);
    if( rc==SQLITE_OK ){
      rc = rc2;
    }
  }

  if (rc != SQLITE_OK){
    sqlite3_free(crsqliteTableName);
    return rc;
  }

  //Add causal lenght column, which determines if the row is deleted or not
  storage_db_exec(&rc, db, "ALTER TABLE %s ADD COLUMN cl INTEGER DEFAULT 1;", crsqliteTableName);
  sqlite3_free(crsqliteTableName);
  return rc;
}