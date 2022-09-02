//
//  sql3parse_table.c
//
//  Created by Marco Bambini on 14/02/16.
//

#include "sql3parse_table.h"

typedef enum {
	// internals
	TOK_EOF	= 0, TOK_ERROR, TOK_IDENTIFIER, TOK_NUMBER, TOK_LITERAL, TOK_COMMENT,
	
	// keywords
	TOK_CREATE, TOK_TEMP, TOK_TABLE, TOK_IF, TOK_NOT, TOK_EXISTS,
	TOK_WITHOUT, TOK_ROWID,
	
	// separators
	TOK_DOT, TOK_SEMICOLON, TOK_COMMA, TOK_OPEN_PARENTHESIS, TOK_CLOSED_PARENTHESIS,
	
	// constraints
	TOK_CONSTRAINT, TOK_PRIMARY, TOK_KEY, TOK_UNIQUE, TOK_CHECK, TOK_FOREIGN,
	TOK_ON, TOK_CONFLICT, TOK_ROLLBACK, TOK_ABORT, TOK_FAIL, TOK_IGNORE, TOK_REPLACE,
	TOK_COLLATE, TOK_ASC, TOK_DESC, TOK_AUTOINCREMENT,
	
	// foreign key clause
	TOK_REFERENCES, TOK_DELETE, TOK_UPDATE, TOK_SET, TOK_NULL, TOK_DEFAULT, TOK_CASCADE,
	TOK_RESTRICT, TOK_NO, TOK_ACTION, TOK_MATCH, TOK_DEFERRABLE, TOK_INITIALLY,
	TOK_DEFERRED, TOK_IMMEDIATE,
	
} sql3token_t;

struct sql3string {
	const char		*ptr;			// ptr to first byte of the string
	size_t			length;			// string length
};

struct sql3foreignkey {
	sql3string		table;			// foreign key table
	size_t			num_columns;
	sql3string		*column_name;
	sql3fk_action		on_delete;
	sql3fk_action		on_update;
	sql3string		match;
	sql3fk_deftype		deferrable;
};

struct sql3column {
	sql3string		name;			// column name
	sql3string		type;			// column type (can be NULL)
	sql3string		length;			// column length (can be NULL)
	sql3string		constraint_name;        // constraint name (can be NULL)
	bool			is_primarykey;          // primary key flag
	bool			is_autoincrement;       // autoincrement flag (only if is_primarykey is true)
	bool			is_notnull;		// not null flag
	bool			is_unique;		// is unique flag
	sql3order_clause	pk_order;               // primary key order
	sql3conflict_clause	pk_conflictclause;      // primary key conflit clause
	sql3conflict_clause 	notnull_conflictclause; // not null conflit clause
	sql3conflict_clause	unique_conflictclause;  // unique conflit clause
	sql3string		check_expr;             // check expression (can be NULL)
	sql3string		default_expr;           // default expression (can be NULL)
	sql3string		collate_name;           // collate name (can be NULL)
	sql3foreignkey		*foreignkey_clause;     // foreign key clause (can be NULL)
};

struct sql3tableconstraint {
	sql3constraint_type	type;			// table constraint type
	sql3string		name;			// constraint name (can be NULL)
	union {
        // if type SQL3TABLECONSTRAINT_PRIMARYKEY or SQL3TABLECONSTRAINT_UNIQUE
	   struct {
		size_t			num_indexed;		// number of indexed columns
		sql3idxcolumn		*indexed_columns;	// array fo indexed columns
		sql3conflict_clause	conflict_clause;	// conflict clause
	   };
        
        // if type SQL3TABLECONSTRAINT_CHECK
		sql3string		check_expr;		// check expression (always NULL in this version)
        
	// if type SQL3TABLECONSTRAINT_FOREIGNKEY
	   struct {
		size_t			foreignkey_num;		// number of columns defined in foreign key
		sql3string		*foreignkey_name;	// column names in the foreign key
		sql3foreignkey		*foreignkey_clause;	// foreign key clause (can be NULL)
	   };
	};
};

struct sql3table {
	sql3string		name;			// table name
	sql3string		schema;			// schema name (can be NULL)
	bool			is_temporary;		// flag set if table is temporary
	bool			is_ifnotexists;		// flag set if table is created with a IF NOT EXISTS clause
	bool			is_withoutrowid;	// flag set if table is created with a WITHOUT ROWID clause
	size_t			num_columns;		// number of columns defined in the table
	sql3column		**columns;		// array of columns defined in the table
	size_t			num_constraint;		// number of table constraint
	sql3tableconstraint	**constraints;		// array of table constraints
};

struct sql3idxcolumn {
	sql3string		name;			// column name
	sql3string		collate_name;		// collate name (can be NULL)
	sql3order_clause	order;			// order
};

typedef struct {
	const char		*buffer;		// original sql
	size_t			size;			// size of the input buffer
	size_t			offset;			// offset inside the input buffer
	sql3string		identifier;		// latest identifier found by the lexer
	sql3table		*table;			// table definition
} sql3state;

// MARK: - Macros -

#define IS_EOF				(state->offset == state->size)
#define PEEK				(state->buffer[state->offset])
#define PEEK2				(state->buffer[state->offset+1])
#define NEXT				(state->buffer[state->offset++])
#define SKIP_ONE			++state->offset;
#define CHECK_STR(s)			if (!s.ptr) return NULL
#define CHECK_IDX(idx1,idx2)		if (idx1>=idx2) return NULL

// MARK: - Public String Functions -

const char *sql3string_ptr (sql3string *s, size_t *length) {
	if (length) *length = s->length;
	return s->ptr;
}

const char *sql3string_cstring (sql3string *s) {
	if (!s->ptr) return NULL;
	
	char *ptr = (char *)SQL3MALLOC0(s->length+1);
	if (!ptr) return NULL;
	
	memcpy(ptr, s->ptr, s->length);
	return (const char *)ptr;
}


// MARK: - Internal Utils -

static int str_nocasencmp(const char *s1, const char *s2, size_t n) {
	while(n > 0 && tolower((unsigned char)*s1) == tolower((unsigned char)*s2)) {
		if(*s1 == '\0') return 0;
		s1++;
		s2++;
		n--;
	}
	
	if(n == 0) return 0;
	return tolower((unsigned char)*s1) - tolower((unsigned char)*s2);
}

static bool symbol_is_space (sql3char c) {
	return ((c == ' ') || (c == '\t') || (c == '\v') || (c == '\f'));
}

static bool symbol_is_newline (sql3char c) {
	return ((c == '\n') || (c == '\r'));
}

static bool symbol_is_toskip (sql3char c) {
	// skip whitespaces and newlines
	return (symbol_is_space(c) || symbol_is_newline(c));
}

static bool symbol_is_comment (sql3char c, sql3state *state) {
	if ((c == '-') && (PEEK2 == '-')) return true;
	if ((c == '/') && (PEEK2 == '*')) return true;
	return false;
}

static bool symbol_is_alpha (sql3char c) {
	if (c == '_') return true;
	return isalpha((int)c);
}

static bool symbol_is_identifier (sql3char c) {
	// when called I am already sure first character is alpha so next valid characters are alpha, digit and _
	return ((isalpha(c)) || (isdigit(c)) || (c == '_'));
}

static bool symbol_is_escape (sql3char c) {
	// From Dr. Hipp
	// An effort is made to use labels in single-quotes as string literals
	// first, as that is the SQL standard.  But if if the token does not make
	// sense as a string literal, it falls back to being an identifier.  This
	// is an ugly hack.  I originally put in the fall-back logic for
	// compatibility with MySQL and I now see that was a mistake.  But it is
	// used a lot in legacy code, so I cannot take it out.
	return ((c == '`') || (c == '\'') || (c == '"') || (c == '['));
}

//static bool symbol_is_number (sql3char c) {
//	if ((c == '+') || (c == '-')) return true;
//	return isdigit(c);
//}

static bool symbol_is_punctuation (sql3char c) {
	return ((c == '.') || (c == ',') || (c == '(') || (c == ')') || (c == ';'));
}

static bool token_is_column_constraint (sql3token_t t) {
	return ((t == TOK_CONSTRAINT) || (t == TOK_PRIMARY) || (t == TOK_NOT) || (t == TOK_UNIQUE) ||
			(t == TOK_CHECK) || (t == TOK_DEFAULT)  || (t == TOK_COLLATE) || (t == TOK_REFERENCES));
}

static bool token_is_table_constraint (sql3token_t t) {
	return ((t == TOK_CONSTRAINT) || (t == TOK_PRIMARY) || (t == TOK_UNIQUE) ||
			(t == TOK_CHECK) || (t == TOK_FOREIGN));
}

// MARK: - Internal Lexer -

static sql3token_t sql3lexer_keyword (const char *ptr, size_t length) {
	
	// check if ptr is a reserved keyword
	switch (length) {
		case 2:
		if (str_nocasencmp(ptr, "if", length) == 0) return TOK_IF;
		if (str_nocasencmp(ptr, "on", length) == 0) return TOK_ON;
		if (str_nocasencmp(ptr, "no", length) == 0) return TOK_NO;
		break;
			
		case 3:
		if (str_nocasencmp(ptr, "not", length) == 0) return TOK_NOT;
		if (str_nocasencmp(ptr, "key", length) == 0) return TOK_KEY;
		if (str_nocasencmp(ptr, "asc", length) == 0) return TOK_ASC;
		if (str_nocasencmp(ptr, "set", length) == 0) return TOK_SET;
		break;
			
		case 4:
		if (str_nocasencmp(ptr, "temp", length) == 0) return TOK_TEMP;
		if (str_nocasencmp(ptr, "desc", length) == 0) return TOK_DESC;
		if (str_nocasencmp(ptr, "null", length) == 0) return TOK_NULL;
		if (str_nocasencmp(ptr, "fail", length) == 0) return TOK_FAIL;
		break;
			
		case 5:
		if (str_nocasencmp(ptr, "table", length) == 0) return TOK_TABLE;
		if (str_nocasencmp(ptr, "rowid", length) == 0) return TOK_ROWID;
		if (str_nocasencmp(ptr, "check", length) == 0) return TOK_CHECK;
		if (str_nocasencmp(ptr, "abort", length) == 0) return TOK_ABORT;
		if (str_nocasencmp(ptr, "match", length) == 0) return TOK_MATCH;
		break;
			
		case 6:
		if (str_nocasencmp(ptr, "create", length) == 0) return TOK_CREATE;
		if (str_nocasencmp(ptr, "exists", length) == 0) return TOK_EXISTS;
		if (str_nocasencmp(ptr, "unique", length) == 0) return TOK_UNIQUE;
		if (str_nocasencmp(ptr, "ignore", length) == 0) return TOK_IGNORE;
		if (str_nocasencmp(ptr, "delete", length) == 0) return TOK_DELETE;
		if (str_nocasencmp(ptr, "update", length) == 0) return TOK_UPDATE;
		if (str_nocasencmp(ptr, "action", length) == 0) return TOK_ACTION;
		break;
		
		case 7:
		if (str_nocasencmp(ptr, "without", length) == 0) return TOK_WITHOUT;
		if (str_nocasencmp(ptr, "primary", length) == 0) return TOK_PRIMARY;
		if (str_nocasencmp(ptr, "default", length) == 0) return TOK_DEFAULT;
		if (str_nocasencmp(ptr, "collate", length) == 0) return TOK_COLLATE;
		if (str_nocasencmp(ptr, "replace", length) == 0) return TOK_REPLACE;
		if (str_nocasencmp(ptr, "cascade", length) == 0) return TOK_CASCADE;
		if (str_nocasencmp(ptr, "foreign", length) == 0) return TOK_FOREIGN;
		break;
			
		case 8:
		if (str_nocasencmp(ptr, "conflict", length) == 0) return TOK_CONFLICT;
		if (str_nocasencmp(ptr, "rollback", length) == 0) return TOK_ROLLBACK;
		if (str_nocasencmp(ptr, "restrict", length) == 0) return TOK_RESTRICT;
		if (str_nocasencmp(ptr, "deferred", length) == 0) return TOK_DEFERRED;
		break;
			
		case 9:
		if (str_nocasencmp(ptr, "temporary", length) == 0) return TOK_TEMP;
		if (str_nocasencmp(ptr, "initially", length) == 0) return TOK_INITIALLY;
		if (str_nocasencmp(ptr, "immediate", length) == 0) return TOK_IMMEDIATE;
		break;
			
		case 10:
		if (str_nocasencmp(ptr, "constraint", length) == 0) return TOK_CONSTRAINT;
		if (str_nocasencmp(ptr, "references", length) == 0) return TOK_REFERENCES;
		if (str_nocasencmp(ptr, "deferrable", length) == 0) return TOK_DEFERRABLE;
		break;
			
		case 13:
		if (str_nocasencmp(ptr, "autoincrement", length) == 0) return TOK_AUTOINCREMENT;
		break;
	}
	
	// no reserved keyword found
	return TOK_IDENTIFIER;
}

sql3token_t sql3lexer_comment (sql3state *state) {
	bool is_c_comment = ((NEXT == '/') && (NEXT == '*'));
	
	while (1) {
		sql3char c1 = NEXT;
		
		// EOF case
		if (c1 == 0) {
			// its an error here ONLY if C-style comment
			return (is_c_comment) ? TOK_ERROR : TOK_COMMENT;
		}
		
		// -- comments are closed by newline
		if ((!is_c_comment) && symbol_is_newline(c1)) break;
		
		// c-style comment needs two characters to check
		sql3char c2 = NEXT;
		if ((is_c_comment) && (c1 == '*') && (c2 == '/')) break;
	}
	
	return TOK_COMMENT;
}

sql3token_t sql3lexer_punctuation (sql3state *state) {
	sql3char c = NEXT;
	
	switch (c) {
		case ',': return TOK_COMMA;
		case '.': return TOK_DOT;
		case '(': return TOK_OPEN_PARENTHESIS;
		case ')': return TOK_CLOSED_PARENTHESIS;
		case ';': return TOK_SEMICOLON;
	}
	
	return TOK_ERROR;
}

sql3token_t sql3lexer_alpha (sql3state *state) {
	size_t offset = state->offset;
	
	while (symbol_is_identifier(PEEK)) {
		SKIP_ONE;
	}
	
	const char *ptr = &state->buffer[offset];
	size_t length = state->offset - offset;
	
	sql3token_t t = sql3lexer_keyword(ptr, length);
	if (t != TOK_IDENTIFIER) return t;
	
	// setup internal identifier
	state->identifier.ptr = ptr;
	state->identifier.length = length;
	
	return TOK_IDENTIFIER;
}

sql3token_t sql3lexer_escape (sql3state *state) {
	sql3char c, escaped = NEXT; // consume escaped char
	if (escaped == '[') escaped = ']'; // mysql compatibility mode
	
	// read until EOF or closing escape character
	size_t offset = state->offset;
	do {
		c = NEXT;
	} while ((c != 0) && (c != escaped));
	
	const char *ptr = &state->buffer[offset];
	size_t length = state->offset - (offset + 1);
	
	// sanity check on closing escaped character
	if (c != escaped) return TOK_ERROR;
	
	// setup internal identifier
	state->identifier.ptr = ptr;
	state->identifier.length = length;
	
	return TOK_IDENTIFIER;
}

static bool sql3lexer_checkskip (sql3state *state) {
    sql3char c;
loop:
    c = PEEK;
    if (symbol_is_toskip(c)) {SKIP_ONE; goto loop;}
    if (symbol_is_comment(c, state)) {if (sql3lexer_comment(state) != TOK_COMMENT) return false; goto loop;}
    
    return true;
}

static sql3token_t sql3lexer_next (sql3state *state) {
loop:
	if (IS_EOF) return TOK_EOF;
	sql3char c = PEEK;
	if (c == 0) return TOK_EOF;
	
	if (symbol_is_toskip(c)) {SKIP_ONE; goto loop;}
	if (symbol_is_comment(c, state)) {if (sql3lexer_comment(state) != TOK_COMMENT) return TOK_ERROR; goto loop;}
	if (symbol_is_punctuation(c)) return sql3lexer_punctuation(state);
	if (symbol_is_alpha(c)) return sql3lexer_alpha(state);
	if (symbol_is_escape(c)) return sql3lexer_escape(state);
	
	return TOK_ERROR;
}

static sql3token_t sql3lexer_peek (sql3state *state) {
	// peek calls sql3lexer_next and reset its state after the call
	size_t saved = state->offset;
	sql3token_t token = sql3lexer_next(state);
	state->offset = saved;
	return token;
}

// MARK: - Internal Parser -

static sql3error_code sql3parse_optionalorder (sql3state *state, sql3order_clause *clause) {
	sql3token_t token = sql3lexer_peek(state);
	*clause = SQL3ORDER_NONE;
	
	if ((token == TOK_ASC) || (token == TOK_DESC)) {
		sql3lexer_next(state);	// consume token
		if (token == TOK_ASC) *clause = SQL3ORDER_ASC;
		else *clause = SQL3ORDER_DESC;
	}
	
	return SQL3ERROR_NONE;
}

static sql3error_code sql3parse_optionalconflitclause (sql3state *state, sql3conflict_clause *conflict) {
	sql3token_t token = sql3lexer_peek(state);
	*conflict = SQL3CONFLICT_NONE;
	
	if (token == TOK_ON) {
		sql3lexer_next(state);	// consume TOK_ON
		
		token = sql3lexer_next(state);
		if (token != TOK_CONFLICT) return SQL3ERROR_SYNTAX;
		
		token = sql3lexer_next(state);
		if (token == TOK_ROLLBACK) *conflict = SQL3CONFLICT_ROOLBACK;
		else if (token == TOK_ABORT) *conflict = SQL3CONFLICT_ABORT;
		else if (token == TOK_FAIL) *conflict = SQL3CONFLICT_FAIL;
		else if (token == TOK_IGNORE) *conflict = SQL3CONFLICT_IGNORE;
		else if (token == TOK_REPLACE) *conflict = SQL3CONFLICT_REPLACE;
		else return SQL3ERROR_SYNTAX;
	}
	
	return SQL3ERROR_NONE;
}

static sql3foreignkey *sql3parse_foreignkey_clause (sql3state *state) {
	sql3foreignkey *fk = SQL3MALLOC0(sizeof(sql3foreignkey));
	if (!fk) return NULL;
	
	// parse foreign table name
	sql3token_t token = sql3lexer_next(state);
	if (token != TOK_IDENTIFIER) goto error;
	fk->table = state->identifier;
	
	// check for optional columns part
	if (sql3lexer_peek(state) == TOK_OPEN_PARENTHESIS) {
		sql3lexer_next(state); // consume TOK_OPEN_PARENTHESIS
		
		// parse column names
		do {
			// parse column-name
			token = sql3lexer_next(state);
			if (token != TOK_IDENTIFIER) goto error;
			
			// add column name
			++fk->num_columns;
			fk->column_name = SQL3REALLOC(fk->column_name, sizeof(sql3string) * fk->num_columns);
			if (!fk->column_name) goto error;
			fk->column_name[fk->num_columns-1] = state->identifier;
			
			token = sql3lexer_peek(state);
			if (token == TOK_COMMA) sql3lexer_next(state); // consume TOK_COMMA
			
		} while (token == TOK_COMMA);
		
		// closed parenthesis is mandatory here
		if (sql3lexer_next(state) != TOK_CLOSED_PARENTHESIS) goto error;
	}
	
	// check for optional part
fk_loop:
	token = sql3lexer_peek(state);
	if ((token == TOK_ON) || (token == TOK_MATCH) || (token == TOK_NOT) || (token == TOK_DEFERRABLE)) {
		sql3lexer_next(state); // consume token
		
		if (token == TOK_MATCH) {
			token = sql3lexer_next(state);
			if (token != TOK_IDENTIFIER) goto error;
			fk->match = state->identifier;
			goto fk_loop;
		}
		
		if (token == TOK_ON) {
			token = sql3lexer_next(state);
			if ((token != TOK_DELETE) && (token != TOK_UPDATE)) goto error;
			bool isupdate = (token == TOK_UPDATE);
			
			token = sql3lexer_next(state);
			if (token == TOK_CASCADE) {
				if (isupdate) fk->on_update = SQL3FKACTION_CASCADE;
				else fk->on_delete = SQL3FKACTION_CASCADE;
			} else if (token == TOK_RESTRICT) {
				if (isupdate) fk->on_update = SQL3FKACTION_RESTRICT;
				else fk->on_delete = SQL3FKACTION_RESTRICT;
			} else if (token == TOK_SET) {
				token = sql3lexer_next(state);
				if ((token != TOK_NULL) && (token != TOK_DEFAULT)) goto error;
				if (token == TOK_NULL) {
					if (isupdate) fk->on_update = SQL3FKACTION_SETNULL;
					else fk->on_delete = SQL3FKACTION_SETNULL;
				} else {
					// TOK_DEFAULT
					if (isupdate) fk->on_update = SQL3FKACTION_SETDEFAULT;
					else fk->on_delete = SQL3FKACTION_SETDEFAULT;
				}
			} else if (token == TOK_NO) {
				if (sql3lexer_next(state) != TOK_ACTION) goto error;
				if (isupdate) fk->on_update = SQL3FKACTION_NOACTION;
				else fk->on_delete = SQL3FKACTION_NOACTION;
			}
			goto fk_loop;
		}
		
		bool isnot = false;
		if (token == TOK_NOT) {
			token = sql3lexer_next(state); // get next token
			isnot = true;
		}
		
		if (token == TOK_DEFERRABLE) {
			fk->deferrable = (isnot) ? SQL3DEFTYPE_NOTDEFERRABLE : SQL3DEFTYPE_DEFERRABLE;
			if (sql3lexer_peek(state) == TOK_INITIALLY) {
				sql3lexer_next(state); // consume TOK_INITIALLY
				token = sql3lexer_next(state); // get next token
				if (token == TOK_DEFERRED) {
					fk->deferrable = (isnot) ? SQL3DEFTYPE_NOTDEFERRABLE_INITIALLY_DEFERRED : SQL3DEFTYPE_DEFERRABLE_INITIALLY_DEFERRED;
				} else if (token == TOK_IMMEDIATE) {
					fk->deferrable = (isnot) ? SQL3DEFTYPE_NOTDEFERRABLE_INITIALLY_IMMEDIATE : SQL3DEFTYPE_DEFERRABLE_INITIALLY_IMMEDIATE;
				} else goto error;
			}
			goto fk_loop;
		}
		goto error;
	}
	
	return fk;
	
error:
	if (fk) SQL3FREE(fk);
	return NULL;
}

static sql3tableconstraint *sql3parse_table_constraint (sql3state *state) {
	sql3token_t token = sql3lexer_peek(state);
	sql3tableconstraint *constraint = (sql3tableconstraint *)SQL3MALLOC0(sizeof(sql3tableconstraint));
	if (!constraint) return NULL;
	
	// optional constraint name
	if (token == TOK_CONSTRAINT) {
		sql3lexer_next(state); // consume token
		token = sql3lexer_next(state);
		if (token != TOK_IDENTIFIER) goto error;
		constraint->name = state->identifier;
		
		// peek next token
		token = sql3lexer_peek(state);
		
		// sanity check next token
		if ((token != TOK_CHECK) && (token != TOK_PRIMARY) && (token != TOK_UNIQUE) && (token != TOK_FOREIGN)) goto error;
	}
	
	// check for others constraint
	if (token == TOK_CHECK) {
		token = sql3lexer_next(state); // consume token
		constraint->type = SQL3TABLECONSTRAINT_CHECK;
		
		// expressions are not supported in this version
		goto error;
	}
	// same code to execute for PRIMARY KEY or UNIQUE constraint
	else if ((token == TOK_PRIMARY) || (token == TOK_UNIQUE)) {
		token = sql3lexer_next(state); // consume token
		if (token == TOK_PRIMARY) {
			if (sql3lexer_next(state) != TOK_KEY) goto error;
			constraint->type = SQL3TABLECONSTRAINT_PRIMARYKEY;
		} else constraint->type = SQL3TABLECONSTRAINT_UNIQUE;
		
		if (sql3lexer_next(state) != TOK_OPEN_PARENTHESIS) goto error;
		
		// get indexed column
		do {
			sql3idxcolumn column = {0};
			
			// parse column-name
			token = sql3lexer_next(state);
			if (token != TOK_IDENTIFIER) goto error;
			column.name = state->identifier;
			
			if (sql3lexer_peek(state) == TOK_COLLATE) {
				sql3lexer_next(state); // consume TOK_COLLATE
				
				// parse collation-name
				token = sql3lexer_next(state);
				if (token != TOK_IDENTIFIER) goto error;
				column.collate_name	= state->identifier;
			}
			
			// parse optional order
			if (sql3parse_optionalorder(state, &column.order) != SQL3ERROR_NONE) goto error;
			
			// add indexed column
			++constraint->num_indexed;
			constraint->indexed_columns = SQL3REALLOC(constraint->indexed_columns, sizeof(sql3idxcolumn) * constraint->num_indexed);
			if (!constraint->indexed_columns) goto error;
			constraint->indexed_columns[constraint->num_indexed-1] = column;
			
			token = sql3lexer_peek(state);
			if (token == TOK_COMMA) sql3lexer_next(state); // consume TOK_COMMA
			
		} while (token == TOK_COMMA);
		
		if (sql3lexer_next(state) != TOK_CLOSED_PARENTHESIS) goto error;
		if (sql3parse_optionalconflitclause(state, &constraint->conflict_clause) != SQL3ERROR_NONE) goto error;
	}
	// foreign key constraint
	else if (token == TOK_FOREIGN) {
		sql3lexer_next(state); // consume TOK_FOREIGN
		if (sql3lexer_next(state) != TOK_KEY) goto error;
		if (sql3lexer_next(state) != TOK_OPEN_PARENTHESIS) goto error;
		
		constraint->type = SQL3TABLECONSTRAINT_FOREIGNKEY;
		
		// get column names
		do {
			// parse column-name
			token = sql3lexer_next(state);
			if (token != TOK_IDENTIFIER) goto error;
			
			// add column name
			++constraint->foreignkey_num;
			constraint->foreignkey_name = SQL3REALLOC(constraint->foreignkey_name, sizeof(sql3string) * constraint->foreignkey_num);
			if (!constraint->foreignkey_name) goto error;
			constraint->foreignkey_name[constraint->foreignkey_num-1] = state->identifier;
			
			token = sql3lexer_peek(state);
			if (token == TOK_COMMA) sql3lexer_next(state); // consume TOK_COMMA
			
		} while (token == TOK_COMMA);
		
		if (sql3lexer_next(state) != TOK_CLOSED_PARENTHESIS) goto error;
		if (sql3lexer_next(state) != TOK_REFERENCES) goto error;
		
		// parse foreign key clause
		sql3foreignkey *fk = sql3parse_foreignkey_clause(state);
		if (!fk) goto error;
		constraint->foreignkey_clause = fk;
	}
		
	return constraint;
	
error:
	if (constraint) SQL3FREE(constraint);
	return NULL;
}

static sql3string sql3parse_literal (sql3state *state) {
    // signed-number (+/-) => numeric-literal
    // literal-value
    //      numeric-literal
    //      string-literal
    //      blob-literal (x/X'')
    //      NULL
    //      TRUE
    //      FALSE
    //      CURRENT_TIME
    //      CURRENT_DATE
    //      CURRENT_TIMESTAMP
    
    sql3lexer_checkskip(state);
    
    size_t offset = state->offset;
    sql3char c = NEXT;
    if (c == '\'' || c == '"') {
        // parse string literal
        sql3char escaped = c;
        while (true) {
            c = NEXT;
            if (c == escaped) {
                sql3char c2 = PEEK;
                if (c2 != escaped) break;
                NEXT;
            }
        }
    } else {
        // parse everything else up until a space
        while (true) {
            c = PEEK;
            if (c == ' ' || c == ',' || c == ')') break;
            c = NEXT;
        }
    }
    
    const char *ptr = &state->buffer[offset];
    size_t length = state->offset - offset;
    
    sql3string result = {ptr, length};
    return result;
}

static sql3string sql3parse_expression (sql3state *state) {
    // '(' expression ')'
    
    sql3lexer_checkskip(state);
    
    size_t offset = state->offset;
    sql3char c = NEXT;      // '('
    unsigned short int count = 1;     // count number of '('
    
    while (true) {
        c = NEXT;
        if (c == '(') ++count;
        else if (c == ')') {
            if (--count == 0) break;
        }
    }
    
    const char *ptr = &state->buffer[offset];
    size_t length = state->offset - offset;
    
    sql3string result = {ptr, length};
    return result;
}

static sql3error_code sql3parse_column_type (sql3state *state, sql3column *column) {
	// column type is reported as a string
	size_t offset = 0;
	while (sql3lexer_peek(state) == TOK_IDENTIFIER) {
		// consume identifier
		sql3lexer_next(state);
		
		// mark the beginning of the first identifier
		if (offset == 0) offset = state->offset - state->identifier.length;
	}
	const char *ptr = &state->buffer[offset];
	size_t length = state->offset - offset;
	
	// setup internal identifier
	column->type.ptr = ptr;
	column->type.length = length;
	
	// check for optional lenght
	if (sql3lexer_peek(state) == TOK_OPEN_PARENTHESIS) {
		sql3lexer_next(state); // consume '('
		
		// mark start of string
		offset = state->offset;
		sql3char c;
		do {
			c = NEXT;
		} while ((c != 0) && (c != ')'));
		
		// sanity check on closing escaped character
		if (c != ')') return SQL3ERROR_SYNTAX;
		
		// don't include ')' in column lenght
		ptr = &state->buffer[offset];
		length = state->offset - (offset + 1);
		
		column->length.ptr = ptr;
		column->length.length = length;
	}
	
	return SQL3ERROR_NONE;
}

static sql3error_code sql3parse_column_constraints (sql3state *state, sql3column *column) {
	while (token_is_column_constraint(sql3lexer_peek(state))) {
		sql3token_t token = sql3lexer_next(state);
		
		// optional constraint name
		if (token == TOK_CONSTRAINT) {
			token = sql3lexer_next(state);
			if (token != TOK_IDENTIFIER) return SQL3ERROR_SYNTAX;
			column->constraint_name = state->identifier;
			token = sql3lexer_next(state);
		}
		
		switch (token) {
			case TOK_PRIMARY:
				token = sql3lexer_next(state);
				if (token != TOK_KEY) return SQL3ERROR_SYNTAX;
				column->is_primarykey = true;
				if (sql3parse_optionalorder(state, &column->pk_order) != SQL3ERROR_NONE) return SQL3ERROR_SYNTAX;
				if (sql3parse_optionalconflitclause(state, &column->pk_conflictclause) != SQL3ERROR_NONE) return SQL3ERROR_SYNTAX;
				if (sql3lexer_peek(state) == TOK_AUTOINCREMENT) {
					sql3lexer_next(state);	// consume TOK_AUTOINCREMENT
					column->is_autoincrement = true;
				}
				break;
				
			case TOK_NOT:
				token = sql3lexer_next(state);
				if (token != TOK_NULL) return SQL3ERROR_SYNTAX;
				column->is_notnull = true;
				if (sql3parse_optionalconflitclause(state, &column->notnull_conflictclause) != SQL3ERROR_NONE) return SQL3ERROR_SYNTAX;
				break;
				
			case TOK_UNIQUE:
				column->is_unique = true;
				if (sql3parse_optionalconflitclause(state, &column->unique_conflictclause) != SQL3ERROR_NONE) return SQL3ERROR_SYNTAX;
				break;
				
			case TOK_CHECK:
                column->check_expr = sql3parse_expression(state);
				break;
				
			case TOK_DEFAULT:
                // signed-number (+/-) => numeric-literal
                // literal-value
                //      numeric-literal
                //      string-literal
                //      blob-literal (x/X'')
                //      NULL
                //      TRUE
                //      FALSE
                //      CURRENT_TIME
                //      CURRENT_DATE
                //      CURRENT_TIMESTAMP
                // '(' expression ')'
                
				// expressions are not supported in this version
				if (sql3lexer_peek(state) == TOK_OPEN_PARENTHESIS) column->default_expr = sql3parse_expression(state);
				else column->default_expr = sql3parse_literal(state);
				break;
				
			case TOK_COLLATE:
				token = sql3lexer_next(state);
				if (token != TOK_IDENTIFIER) return SQL3ERROR_SYNTAX;
				column->collate_name = state->identifier;
				break;
				
			case TOK_REFERENCES: {
				sql3foreignkey *fk = sql3parse_foreignkey_clause(state);
				if (!fk) return SQL3ERROR_SYNTAX;
				column->foreignkey_clause = fk;
			} break;
				
			default: return SQL3ERROR_SYNTAX;
		}
	}
	
	return SQL3ERROR_NONE;
}

static sql3column *sql3parse_column (sql3state *state) {
	sql3column *column = SQL3MALLOC0(sizeof(sql3column));
	if (!column) return NULL;
	
	// column name is mandatory
	sql3token_t token = sql3lexer_next(state);
	if (token != TOK_IDENTIFIER) goto error;
	
	// copy column name
	column->name = state->identifier;
	
	// parse optional column type
	if (sql3lexer_peek(state) == TOK_IDENTIFIER) {
		if (sql3parse_column_type(state, column) != SQL3ERROR_NONE) goto error;
	}
	
	// check optional column constraints path
	if (token_is_column_constraint(sql3lexer_peek(state))) {
		if (sql3parse_column_constraints(state, column) != SQL3ERROR_NONE) goto error;
	}
		
	return column;
	
error:
	if (column) SQL3FREE(column);
	return NULL;
}

static sql3error_code sql3parse (sql3state *state) {
	// CREATE [TEMP | TEMPORARY] TABLE [IF NOT EXISTS] [schema-name .]table-name ...
	
	// interested only in CREATE statements
	sql3token_t token = sql3lexer_next(state);
	if (token != TOK_CREATE) return SQL3ERROR_UNSUPPORTEDSQL;
	
	sql3table *table = state->table;
	
	// next statement after a CREATE can be TEMP or a TABLE
	token = sql3lexer_next(state);
	if (token == TOK_TEMP) {
		table->is_temporary = true;
		
		// parse next token (must be TABLE token)
		token = sql3lexer_next(state);
	}
	
	// assure TABLE token
	if (token != TOK_TABLE) return SQL3ERROR_UNSUPPORTEDSQL;
	
	// check for IF NOT EXISTS clause
	if (sql3lexer_peek(state) == TOK_IF) {
		// consume IF
		sql3lexer_next(state);
		
		// next must be NOT
		if (sql3lexer_next(state) != TOK_NOT) return SQL3ERROR_SYNTAX;
		
		// next must be EXISTS
		if (sql3lexer_next(state) != TOK_EXISTS) return SQL3ERROR_SYNTAX;
		
		// safely set the flag here
		table->is_ifnotexists = true;
	}
	
	// at this point there should be an identifier
	// only the optional dot will tell if it is a schema or a table name
	if (sql3lexer_next(state) != TOK_IDENTIFIER) return SQL3ERROR_SYNTAX;
	const char *identifier = sql3string_ptr(&state->identifier, NULL);
	printf("%s\n", identifier);
	if (!identifier) return SQL3ERROR_SYNTAX;
	
	// check for optional DOT (if any then identifier is a schema name)
	if (sql3lexer_peek(state) == TOK_DOT) {
		// consume DOT
		sql3lexer_next(state);
		
		// set schema name
		table->schema = state->identifier;
		
		// parse table name
		if (sql3lexer_next(state) != TOK_IDENTIFIER) return SQL3ERROR_SYNTAX;
		identifier = sql3string_ptr(&state->identifier, NULL);
		if (!identifier) return SQL3ERROR_SYNTAX;
	}
	
	// set table name
	table->name = state->identifier;
	
	// start parsing column and table constraints
	
	// '(' is mandatory here
	token = sql3lexer_next(state);
	if (token != TOK_OPEN_PARENTHESIS) return SQL3ERROR_SYNTAX;
	
	// parse column-def
	while (1) {
		token = sql3lexer_peek(state);
		
		// column name is mandatory here
		if (token != TOK_IDENTIFIER) return SQL3ERROR_SYNTAX;
		
		// parse column definition
		sql3column *column = sql3parse_column(state);
		if (!column) return SQL3ERROR_SYNTAX;
		
		// add column to columns array
		++table->num_columns;
		table->columns = SQL3REALLOC(table->columns, sizeof(sql3column**) * table->num_columns);
		if (!table->columns) return SQL3ERROR_MEMORY;
		table->columns[table->num_columns-1] = column;
		
		// check for optional comma
		token = sql3lexer_peek(state);
		if (token == TOK_COMMA) {
			sql3lexer_next(state);	// consume comma
			token = sql3lexer_peek(state);	// peek next token
			
			if (token_is_table_constraint(token)) break;
			else continue;
		}
		
		if (token == TOK_CLOSED_PARENTHESIS) break;
		
		// if it is not an identifier -> column, a comma, a token_table_constraint
		// nor a closed_parenthesis then it is a syntax error
		return SQL3ERROR_SYNTAX;
	}
	
	// parse optional table-constraint
	while (token_is_table_constraint(token)) {
		sql3tableconstraint *constraint = sql3parse_table_constraint(state);
		if (!constraint) return SQL3ERROR_SYNTAX;
		
		// add column to columns array
		++table->num_constraint;
		table->constraints = SQL3REALLOC(table->constraints, sizeof(sql3tableconstraint**) * table->num_constraint);
		if (!table->constraints) return SQL3ERROR_MEMORY;
		table->constraints[table->num_constraint-1] = constraint;
		
		// check for optional comma
		if (sql3lexer_peek(state) == TOK_COMMA) {
			sql3lexer_next(state);	// consume comma
			token = sql3lexer_peek(state);	// peek next token
			continue;
		}
		
		if (sql3lexer_peek(state) == TOK_CLOSED_PARENTHESIS) break;
		
		// if it is not a token_table_constraint nor a closed_parenthesis then it is a syntax error
		return SQL3ERROR_SYNTAX;
	}
	
	// ')' is mandatory here
	token = sql3lexer_next(state);
	if (token != TOK_CLOSED_PARENTHESIS) return SQL3ERROR_SYNTAX;
	
	// finally check for WITHOUT ROWID clause
	if (sql3lexer_peek(state) == TOK_WITHOUT) {
		// consume WITHOUT
		sql3lexer_next(state);
		
		// ROWID is mandatory at this point
		if (sql3lexer_next(state) != TOK_ROWID) return SQL3ERROR_SYNTAX;
		
		// set without rowid flag
		table->is_withoutrowid = true;
	}
	
	// check and consume optional ;
	token = sql3lexer_peek(state);
	if (token == TOK_SEMICOLON) sql3lexer_next(state);
	
	return SQL3ERROR_NONE;
}

#pragma mark - Public Table Functions -

sql3string *sql3table_schema (sql3table *table) {
	CHECK_STR(table->schema);
	return &table->schema;
}

sql3string *sql3table_name (sql3table *table) {
	CHECK_STR(table->name);
	return &table->name;
}

bool sql3table_is_temporary (sql3table *table) {
	return table->is_temporary;
}

bool sql3table_is_ifnotexists (sql3table *table) {
	return table->is_ifnotexists;
}

bool sql3table_is_withoutrowid (sql3table *table) {
	return table->is_withoutrowid;
}

size_t sql3table_num_columns (sql3table *table) {
	return table->num_columns;
}

sql3column *sql3table_get_column (sql3table *table, size_t index) {
	CHECK_IDX(index, table->num_columns);
	return table->columns[index];
}

size_t sql3table_num_constraints (sql3table *table) {
	return table->num_constraint;
}

sql3tableconstraint *sql3table_get_constraint (sql3table *table, size_t index) {
	CHECK_IDX(index, table->num_constraint);
	return table->constraints[index];
}

void sql3table_free (sql3table *table) {
	if (!table) return;
	
	// free columns
	for (size_t i=0; i<table->num_columns; ++i) {
		sql3column *column = table->columns[i];
		if (column->foreignkey_clause) {
			if (column->foreignkey_clause->column_name) SQL3FREE(column->foreignkey_clause->column_name);
			SQL3FREE(column->foreignkey_clause);
		}
		SQL3FREE(column);
	}
	if (table->columns) SQL3FREE(table->columns);
	
	// free table constraints
	for (size_t i=0; i<table->num_constraint; ++i) {
		sql3tableconstraint *constraint = table->constraints[i];
		if ((constraint->type == SQL3TABLECONSTRAINT_PRIMARYKEY) || (constraint->type == SQL3TABLECONSTRAINT_UNIQUE)) {
			if (constraint->indexed_columns) SQL3FREE(constraint->indexed_columns);
		} else if (constraint->type == SQL3TABLECONSTRAINT_FOREIGNKEY) {
			if (constraint->foreignkey_name) SQL3FREE(constraint->foreignkey_name);
			if (constraint->foreignkey_clause) {
				if (constraint->foreignkey_clause->column_name) SQL3FREE(constraint->foreignkey_clause->column_name);
				SQL3FREE(constraint->foreignkey_clause);
			}
		}
		SQL3FREE(constraint);
	}
	if (table->constraints) SQL3FREE(table->constraints);
	
	SQL3FREE(table);
}

// MARK: - Public Table Constraint Functions -

sql3string *sql3table_constraint_name (sql3tableconstraint *tconstraint) {
	CHECK_STR(tconstraint->name);
	return &tconstraint->name;
}

sql3constraint_type sql3table_constraint_type (sql3tableconstraint *tconstraint) {
	return tconstraint->type;
}

size_t sql3table_constraint_num_idxcolumns (sql3tableconstraint *tconstraint) {
	if ((tconstraint->type != SQL3TABLECONSTRAINT_PRIMARYKEY) && (tconstraint->type != SQL3TABLECONSTRAINT_UNIQUE)) return 0;
	return tconstraint->num_indexed;
}

sql3idxcolumn *sql3table_constraint_get_idxcolumn (sql3tableconstraint *tconstraint, size_t index) {
	if ((tconstraint->type != SQL3TABLECONSTRAINT_PRIMARYKEY) && (tconstraint->type != SQL3TABLECONSTRAINT_UNIQUE)) return NULL;
	CHECK_IDX(index, tconstraint->num_indexed);
	return &tconstraint->indexed_columns[index];
}

sql3conflict_clause sql3table_constraint_conflict_clause (sql3tableconstraint *tconstraint) {
	if ((tconstraint->type != SQL3TABLECONSTRAINT_PRIMARYKEY) && (tconstraint->type != SQL3TABLECONSTRAINT_UNIQUE)) return SQL3CONFLICT_NONE;
	return tconstraint->conflict_clause;
}

sql3string *sql3table_constraint_check_expr (sql3tableconstraint *tconstraint) {
	if (tconstraint->type != SQL3TABLECONSTRAINT_CHECK) return NULL;
	CHECK_STR(tconstraint->check_expr);
	return &tconstraint->check_expr;
}

size_t sql3table_constraint_num_fkcolumns (sql3tableconstraint *tconstraint) {
	if (tconstraint->type != SQL3TABLECONSTRAINT_FOREIGNKEY) return 0;
	return tconstraint->foreignkey_num;
}

sql3string *sql3table_constraint_get_fkcolumn (sql3tableconstraint *tconstraint, size_t index) {
	if (tconstraint->type != SQL3TABLECONSTRAINT_FOREIGNKEY) return NULL;
	CHECK_IDX(index, tconstraint->foreignkey_num);
	CHECK_STR(tconstraint->foreignkey_name[index]);
	return &(tconstraint->foreignkey_name[index]);
}

sql3foreignkey *sql3table_constraint_foreignkey_clause (sql3tableconstraint *tconstraint) {
	if (tconstraint->type != SQL3TABLECONSTRAINT_FOREIGNKEY) return NULL;
	return tconstraint->foreignkey_clause;
}

// MARK: - Public Column Functions -

sql3string *sql3column_name (sql3column *column) {
	CHECK_STR(column->name);
	return &column->name;
}

sql3string *sql3column_type (sql3column *column) {
	CHECK_STR(column->type);
	return &column->type;
}

sql3string *sql3column_length (sql3column *column) {
	CHECK_STR(column->length);
	return &column->length;
}

sql3string *sql3column_constraint_name (sql3column *column) {
	CHECK_STR(column->constraint_name);
	return &column->constraint_name;
}

bool sql3column_is_primarykey (sql3column *column) {
	return column->is_primarykey;
}

bool sql3column_is_autoincrement (sql3column *column) {
	return column->is_autoincrement;
}

bool sql3column_is_notnull (sql3column *column) {
	return column->is_notnull;
}

bool sql3column_is_unique (sql3column *column) {
	return column->is_unique;
}

sql3order_clause sql3column_pk_order (sql3column *column) {
	return column->pk_order;
}

sql3conflict_clause sql3column_pk_conflictclause (sql3column *column) {
	return column->pk_conflictclause;
}

sql3conflict_clause sql3column_notnull_conflictclause (sql3column *column) {
	return column->notnull_conflictclause;
}

sql3conflict_clause sql3column_unique_conflictclause (sql3column *column) {
	return column->unique_conflictclause;
}

sql3string *sql3column_check_expr (sql3column *column) {
	CHECK_STR(column->check_expr);
	return &column->check_expr;
}

sql3string *sql3column_default_expr (sql3column *column) {
	CHECK_STR(column->default_expr);
	return &column->default_expr;
}

sql3string *sql3column_collate_name (sql3column *column) {
	CHECK_STR(column->collate_name);
	return &column->collate_name;
}

sql3foreignkey *sql3column_foreignkey_clause (sql3column *column) {
	return column->foreignkey_clause;
}

// MARK: - Public Foreign Key Functions -

sql3string *sql3foreignkey_table (sql3foreignkey *fk) {
	CHECK_STR(fk->table);
	return &fk->table;
}

size_t sql3foreignkey_num_columns (sql3foreignkey *fk) {
	return fk->num_columns;
}

sql3string *sql3foreignkey_get_column (sql3foreignkey *fk, size_t index) {
	if (index >= fk->num_columns) return NULL;
	CHECK_STR(fk->column_name[index]);
	
	return &fk->column_name[index];
}

sql3fk_action sql3foreignkey_ondelete_action (sql3foreignkey *fk) {
	return fk->on_delete;
}

sql3fk_action sql3foreignkey_onupdate_action (sql3foreignkey *fk) {
	return fk->on_update;
}

sql3string *sql3foreignkey_match (sql3foreignkey *fk) {
	CHECK_STR(fk->match);
	return &fk->match;
}

sql3fk_deftype sql3foreignkey_deferrable (sql3foreignkey *fk) {
	return fk->deferrable;
}

// MARK: - Public Index Column Functions -

sql3string *sql3idxcolumn_name (sql3idxcolumn *idxcolumn) {
	CHECK_STR(idxcolumn->name);
	return &idxcolumn->name;
}

sql3string *sql3idxcolumn_collate (sql3idxcolumn *idxcolumn) {
	CHECK_STR(idxcolumn->collate_name);
	return &idxcolumn->collate_name;
}

sql3order_clause sql3idxcolumn_order (sql3idxcolumn *idxcolumn) {
	return idxcolumn->order;
}

// MARK: - Main Entrypoint -

sql3table *sql3parse_table (const char *sql, size_t length, sql3error_code *error) {
	// initial sanity check
	if (sql == NULL) return NULL;
	if (length == 0) length = strlen(sql);
	if (error) *error = SQL3ERROR_NONE;
	if (length == 0) return NULL;
	
	// allocate table
	sql3table *table = SQL3MALLOC0(sizeof(sql3table));
	if (!table) goto error_memory;
	
	// setup state
	sql3state state = {0};
	state.buffer = sql;
	state.size = length;
	state.table = table;
	
	// begin parsing
	sql3error_code err = sql3parse(&state);
	if (error) *error = err;
	
	// no error case, so return table
	if (err == SQL3ERROR_NONE) return table;
	
	// an error occurred
	SQL3FREE(table);
	return NULL;
	
error_memory:
	if (table) SQL3FREE(table);
	if (error) *error = SQL3ERROR_MEMORY;
	return NULL;
}


