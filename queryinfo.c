/**
 * Given a query:
 * - get its type
 * - get its unquoted table name
 *
 */
#include "consts.h"
#include "util.h"
#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3
#include "queryinfo.h"
#include <assert.h>
#include <string.h>

cfsql_QueryInfo *cfsql_newQueryInfo()
{
  cfsql_QueryInfo *ret = sqlite3_malloc(sizeof *ret);

  ret->ifExists = 0;
  ret->ifNotExists = 0;
  ret->prefix = 0;
  ret->suffix = 0;
  ret->schemaName = strdup("main");
  ret->tblName = 0;
  ret->type = 0;
  ret->isTemp = 0;
  ret->prefix = 0;
  ret->suffix = 0;

  return ret;
}

/**
 * Given a query passed to cfsqlite, determine what kind of schema modification
 * query it is.
 *
 * We need to know given each schema modification type
 * requires unique handling in the crr layer.
 *
 * The provided query must be a normalized query.
 *
 * We don't need a full fledge parser yet
 * so we're just scanning through the nomralized query.
 */
static int determineQueryType(const char *query, char **err)
{
  int rc = SQLITE_OK;

  // https://www.sqlite.org/lang_createtable.html
  if (strncmp("create temp", query, 11) == 0 || strncmp("create table", query, 12) == 0)
  {
    return CREATE_TABLE;
  }
  // https://www.sqlite.org/lang_createindex.html
  if (strncmp("create unique", query, 13) == 0 || strncmp("create index", query, CREATE_INDEX_LEN) == 0)
  {
    return CREATE_INDEX;
  }
  // https://www.sqlite.org/lang_altertable.html
  if (strncmp("alter table", query, ALTER_TABLE_LEN) == 0)
  {
    return ALTER_TABLE;
  }
  // https://www2.sqlite.org/lang_dropindex.html
  if (strncmp("drop index", query, DROP_INDEX_LEN) == 0)
  {
    return DROP_INDEX;
  }
  // https://www.sqlite.org/lang_droptable.html
  if (strncmp("drop table", query, DROP_TABLE_LEN) == 0)
  {
    return DROP_TABLE;
  }

  *err = sqlite3_mprintf("Unknown schema modification statement provided: %s", query);
  return SQLITE_MISUSE;
}

/**
 * Extract schema name and table name from the string starting
 * at `start`.
 * 
 * If schema name is not present, null is filled in for the schema name.
 * 
 * Returns a pointer to the character in the string following the schema and table name(s).
 */
char *cfsql_extractSchemaTblNamePrefixSuffix(char *normalized, char *start, cfsql_QueryInfo *ret)
{
  char *past = 0;
  char *identifier1 = cfsql_extractIdentifier(start, &past);
  char *identifier2 = 0;
  int id1len = strlen(identifier1);

  if (start[id1len] == '.')
  {
    identifier2 = cfsql_extractIdentifier(past + 1, &past);
  }

  if (identifier2 != 0)
  {
    ret->schemaName = identifier1;
    ret->tblName = identifier2;
  }
  else
  {
    ret->tblName = identifier1;
  }

  ret->prefix = strndup(normalized, start - normalized);
  ret->suffix = strdup(past);

  return past;
}

cfsql_QueryInfo *queryInfoForCreateTable(char *normalized, char **err)
{
  cfsql_QueryInfo *ret = cfsql_newQueryInfo();

  // +7 for "create "
  char *newStart = normalized + 7;

  if (strncmp(newStart, "temporary", 9) == 0)
  {
    ret->isTemp = 1;
    newStart += 10;
  }
  else if (strncmp(newStart, "temp", 4) == 0)
  {
    ret->isTemp = 1;
    newStart += 5;
  }

  // skip past "table"
  newStart += 5;

  if (*newStart == ' ')
  {
    newStart += 1;
  }

  if (strncmp(newStart, "if not exists", 13) == 0)
  {
    ret->ifNotExists = 1;
    newStart += 13;
  }

  if (*newStart == ' ')
  {
    newStart += 1;
  }

  cfsql_extractSchemaTblNamePrefixSuffix(normalized, newStart, ret);

  ret->type = CREATE_TABLE;
  ret->reformedQuery = normalized;
  return ret;
}

cfsql_QueryInfo *queryInfoForDropTable(char *normalized, char **err)
{
  cfsql_QueryInfo *ret = cfsql_newQueryInfo();

  // +10 for "drop table"
  char *newStart = normalized + 10;

  if (*newStart == ' ')
  {
    newStart += 1;
  }

  if (strncmp(newStart, "if exists", 9) == 0) {
    ret->ifExists = 1;
    newStart += 9;
  }

  if (*newStart == ' ')
  {
    newStart += 1;
  }

  cfsql_extractSchemaTblNamePrefixSuffix(normalized, newStart, ret);
  ret->type = DROP_TABLE;
  ret->reformedQuery = normalized;
  return ret;
}

cfsql_QueryInfo *queryInfoForAlterTable(char *normalized, char **err)
{
  cfsql_QueryInfo *ret = cfsql_newQueryInfo();

  // +11 for "alter table"
  char *newStart = normalized + 11;

  if (*newStart == ' ')
  {
    newStart += 1;
  }

  cfsql_extractSchemaTblNamePrefixSuffix(normalized, newStart, ret);
  ret->type = ALTER_TABLE;
  ret->reformedQuery = normalized;
  return ret;
}

cfsql_QueryInfo *queryInfoForCreateIndex(char *normalized, char **err)
{
  cfsql_QueryInfo *ret = cfsql_newQueryInfo();

  // +7 for "create "
  char *newStart = normalized + 7;

  if (strncmp(newStart, "unique index", 12) == 0) {
    // +12 for "unique index"
    newStart += 12;
  }

  if (strncmp(newStart, "index", 5) == 0) {
    newStart += 6;
  }

  if (*newStart == ' ')
  {
    newStart += 1;
  }

  if (strncmp(newStart, "if not exists", 13) == 0) {
    newStart += 13;
    ret->ifNotExists = 1;
  }

  if (*newStart == ' ')
  {
    newStart += 1;
  }

  // NOTE: this is actually extracting `schame_name.index_name`
  newStart = cfsql_extractSchemaTblNamePrefixSuffix(normalized, newStart, ret);

  if (*newStart == ' ')
  {
    newStart += 1;
  }

  // ON
  newStart += 2;

  if (*newStart == ' ')
  {
    newStart += 1;
  }

  // now get the actual table name and re-write the prefix and suffixes
  cfsql_extractSchemaTblNamePrefixSuffix(normalized, newStart, ret);

  ret->type = CREATE_INDEX;
  ret->reformedQuery = normalized;
  return ret;
}

cfsql_QueryInfo *queryInfoForDropIndex(char *normalized, char **err)
{
  cfsql_QueryInfo *ret = cfsql_newQueryInfo();

  // +10 for "drop index"
  char *newStart = normalized + 10;

  if (strncmp(newStart, "if exists", 9) == 0) {
    ret->ifExists = 1;
    newStart += 10;
  }

  if (*newStart == ' ')
  {
    newStart += 1;
  }

  cfsql_extractSchemaTblNamePrefixSuffix(normalized, newStart, ret);
  ret->type = DROP_INDEX;
  ret->reformedQuery = normalized;
  return ret;
}

cfsql_QueryInfo *cfsql_queryInfo(const char *query, char **err)
{
  // 1. determine query type
  // 2. find table name start
  // 3. determine quoting
  // 4. scan till end of quoting
  //    this scans until we hit an unescaped quote character.

  char *normalized = cfsql_normalize(query);
  cfsql_QueryInfo *ret = 0;

  if (normalized == 0)
  {
    *err = strdup("Failed to normalized the provided query");
    return 0;
  }

  cfsql_QueryType queryType = determineQueryType(normalized, err);
  if (queryType == SQLITE_MISUSE)
  {
    sqlite3_free(normalized);
    return 0;
  }

  switch (queryType)
  {
  case CREATE_TABLE:
    ret = queryInfoForCreateTable(normalized, err);
    break;
  case DROP_TABLE:
    ret = queryInfoForDropTable(normalized, err);
    break;
  case ALTER_TABLE:
    ret = queryInfoForAlterTable(normalized, err);
    break;
  case CREATE_INDEX:
    ret = queryInfoForCreateIndex(normalized, err);
    break;
  case DROP_INDEX:
    ret = queryInfoForDropIndex(normalized, err);
    break;
  default:
    assert("impossible");
  }

  return ret;
}

void cfsql_freeQueryInfo(cfsql_QueryInfo *queryInfo)
{
  sqlite3_free(queryInfo->reformedQuery);
  sqlite3_free(queryInfo->schemaName);
  sqlite3_free(queryInfo->tblName);
  sqlite3_free(queryInfo);
  sqlite3_free(queryInfo->prefix);
  sqlite3_free(queryInfo->suffix);
}