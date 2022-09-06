//
//  sql3parse_table.h
//
//  Created by Marco Bambini on 14/02/16.
//

// Memory requirements on 64bit system:
// number of columns WITHOUT a foreign key constraints => N1
// number of columns WITH a foreign key constraints => N2
// if table has a foreign key constraint then add 64 + (40 for each idx column)
// Total memory = 144 + (N1 * 144) + (N2 * 208) + table_constraint_size

#ifndef __SQL3PARSE_TABLE__
#define __SQL3PARSE_TABLE__

#include <stdio.h>
#include <ctype.h>
#include <string.h>
#include <stdlib.h>
#include <stdbool.h>

// Make sure we can call this stuff from C++
#ifdef __cplusplus
extern "C" {
#endif

// Redefine macros here if you want to use a custom allocator
#define SQL3MALLOC(size)            malloc(size)
#define SQL3MALLOC0(size)           calloc(1,size)
#define SQL3FREE(ptr)               free(ptr)
#define SQL3REALLOC(ptr,size)       realloc(ptr,size)

// Opaque types that hold table, column and foreign key details
typedef struct sql3table            sql3table;
typedef struct sql3column           sql3column;
typedef struct sql3idxcolumn        sql3idxcolumn;
typedef struct sql3foreignkey       sql3foreignkey;
typedef struct sql3tableconstraint  sql3tableconstraint;
typedef struct sql3string           sql3string;
typedef uint16_t                    sql3char;
	
typedef enum {
	SQL3ERROR_NONE,
	SQL3ERROR_MEMORY,
	SQL3ERROR_SYNTAX,
	SQL3ERROR_UNSUPPORTEDSQL
} sql3error_code;
	
typedef enum {
	SQL3CONFLICT_NONE,
	SQL3CONFLICT_ROOLBACK,
	SQL3CONFLICT_ABORT,
	SQL3CONFLICT_FAIL,
	SQL3CONFLICT_IGNORE,
	SQL3CONFLICT_REPLACE
} sql3conflict_clause;

typedef enum {
	SQL3ORDER_NONE,
	SQL3ORDER_ASC,
	SQL3ORDER_DESC
} sql3order_clause;

typedef enum {
	SQL3FKACTION_NONE,
	SQL3FKACTION_SETNULL,
	SQL3FKACTION_SETDEFAULT,
	SQL3FKACTION_CASCADE,
	SQL3FKACTION_RESTRICT,
	SQL3FKACTION_NOACTION
} sql3fk_action;
	
typedef enum {
	SQL3DEFTYPE_NONE,
	SQL3DEFTYPE_DEFERRABLE,
	SQL3DEFTYPE_DEFERRABLE_INITIALLY_DEFERRED,
	SQL3DEFTYPE_DEFERRABLE_INITIALLY_IMMEDIATE,
	SQL3DEFTYPE_NOTDEFERRABLE,
	SQL3DEFTYPE_NOTDEFERRABLE_INITIALLY_DEFERRED,
	SQL3DEFTYPE_NOTDEFERRABLE_INITIALLY_IMMEDIATE
} sql3fk_deftype;

typedef enum {
	SQL3TABLECONSTRAINT_PRIMARYKEY,
	SQL3TABLECONSTRAINT_UNIQUE,
	SQL3TABLECONSTRAINT_CHECK,
	SQL3TABLECONSTRAINT_FOREIGNKEY
} sql3constraint_type;
	
// Main http://www.sqlite.org/lang_createtable.html
sql3table *sql3parse_table (const char *sql, size_t length, sql3error_code *error);

// Table Information
sql3string  *sql3table_schema (sql3table *table);
sql3string  *sql3table_name (sql3table *table);
bool        sql3table_is_temporary (sql3table *table);
bool        sql3table_is_ifnotexists (sql3table *table);
bool        sql3table_is_withoutrowid (sql3table *table);
size_t      sql3table_num_columns (sql3table *table);
sql3column  *sql3table_get_column (sql3table *table, size_t index);
size_t      sql3table_num_constraints (sql3table *table);
sql3tableconstraint *sql3table_get_constraint (sql3table *table, size_t index);
void        sql3table_free (sql3table *table);
	
// Table Constraint
sql3string *sql3table_constraint_name (sql3tableconstraint *tconstraint);
sql3constraint_type sql3table_constraint_type (sql3tableconstraint *tconstraint);
size_t sql3table_constraint_num_idxcolumns (sql3tableconstraint *tconstraint);
sql3idxcolumn *sql3table_constraint_get_idxcolumn (sql3tableconstraint *tconstraint, size_t index);
sql3conflict_clause sql3table_constraint_conflict_clause (sql3tableconstraint *tconstraint);
sql3string *sql3table_constraint_check_expr (sql3tableconstraint *tconstraint);
size_t sql3table_constraint_num_fkcolumns (sql3tableconstraint *tconstraint);
sql3string *sql3table_constraint_get_fkcolumn (sql3tableconstraint *tconstraint, size_t index);
sql3foreignkey *sql3table_constraint_foreignkey_clause (sql3tableconstraint *tconstraint);

// Column Constraint
sql3string *sql3column_name (sql3column *column);
sql3string *sql3column_type (sql3column *column);
sql3string *sql3column_length (sql3column *column);
sql3string *sql3column_constraint_name (sql3column *column);
bool sql3column_is_primarykey (sql3column *column);
bool sql3column_is_autoincrement (sql3column *column);
bool sql3column_is_notnull (sql3column *column);
bool sql3column_is_unique (sql3column *column);
sql3order_clause sql3column_pk_order (sql3column *column);
sql3conflict_clause sql3column_pk_conflictclause (sql3column *column);
sql3conflict_clause sql3column_notnull_conflictclause (sql3column *column);
sql3conflict_clause sql3column_unique_conflictclause (sql3column *column);
sql3string *sql3column_check_expr (sql3column *column);
sql3string *sql3column_default_expr (sql3column *column);
sql3string *sql3column_collate_name (sql3column *column);
sql3foreignkey *sql3column_foreignkey_clause (sql3column *column);
	
// Foreign Key
sql3string *sql3foreignkey_table (sql3foreignkey *fk);
size_t sql3foreignkey_num_columns (sql3foreignkey *fk);
sql3string *sql3foreignkey_get_column (sql3foreignkey *fk, size_t index);
sql3fk_action sql3foreignkey_ondelete_action (sql3foreignkey *fk);
sql3fk_action sql3foreignkey_onupdate_action (sql3foreignkey *fk);
sql3string *sql3foreignkey_match (sql3foreignkey *fk);
sql3fk_deftype sql3foreignkey_deferrable (sql3foreignkey *fk);

// Indexed Column
sql3string *sql3idxcolumn_name (sql3idxcolumn *idxcolumn);
sql3string *sql3idxcolumn_collate (sql3idxcolumn *idxcolumn);
sql3order_clause sql3idxcolumn_order (sql3idxcolumn *idxcolumn);
	
// String Utils
const char *sql3string_ptr (sql3string *s, size_t *length);
const char *sql3string_cstring (sql3string *s);
	
#ifdef __cplusplus
}  // end of the 'extern "C"' block
#endif


#endif