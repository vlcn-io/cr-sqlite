#ifndef CFSQLITE_QUERYINFO_H
#define CFSQLITE_QUERYINFO_H

char *cfsql_normalize(const char *zSql);

typedef enum cfsql_QueryType cfsql_QueryType;
enum cfsql_QueryType {
  CREATE_TABLE = 0,
  DROP_TABLE = 1,
  ALTER_TABLE = 2,
  CREATE_INDEX = 3,
  DROP_INDEX = 4
};

typedef struct cfsql_QueryInfo cfsql_QueryInfo;
struct cfsql_QueryInfo {
  cfsql_QueryType type;
  int ifNotExists;
  int ifExists;
  int isTemp;

  char *schemaName;
  char *tblName;
  char *prefix;
  char *suffix;
  char *reformedQuery;

  const char *origQuery;
  // we should extract column numbers if they exist for Aphrodite
  // so we can put them into table info
};

cfsql_QueryInfo *cfsql_queryInfo(const char *query, char **err);
void cfsql_freeQueryInfo(cfsql_QueryInfo *queryInfo);
cfsql_QueryInfo *cfsql_newQueryInfo();

#endif