#include <stdio.h>
#include <assert.h>
#include <string.h>
#include "queryinfo.h"

static void checkQueryInfo(cfsql_QueryInfo *result, cfsql_QueryInfo *expected, char *err)
{
  if (result == 0)
  {
    printf("Err: %s\n", err);
  }
  assert(result != 0);
  assert(result->ifExists == expected->ifExists);
  assert(result->ifNotExists == expected->ifNotExists);
  assert(result->isTemp == expected->isTemp);
  if (result->schemaName != expected->schemaName)
  {
    assert(strcmp(result->schemaName, expected->schemaName) == 0);
  }
  if (result->tblName != expected->tblName)
  {
    assert(strcmp(result->tblName, expected->tblName) == 0);
  }
  if (result->reformedQuery != expected->reformedQuery)
  {
    assert(strcmp(result->reformedQuery, expected->reformedQuery) == 0);
  }
  cfsql_freeQueryInfo(result);
}

void testQueryInfo()
{
  printf("QueryInfo\n");
  cfsql_QueryInfo *result = 0;
  cfsql_QueryInfo *expected = cfsql_newQueryInfo();
  char *err = 0;

  result = cfsql_queryInfo("CREATE   TABLE [foo] (a, b);", &err);
  expected->prefix = "create table ";
  expected->suffix = "(a,b);";
  expected->tblName = "foo";
  expected->reformedQuery = "create table[foo](a,b);";
  checkQueryInfo(result, expected, err);

  result = cfsql_queryInfo("CREATE   TABLE \"foo\" (a, b);", &err);
  expected->reformedQuery = "create table\"foo\"(a,b);";
  checkQueryInfo(result, expected, err);

  result = cfsql_queryInfo("create table foo (a, b);", &err);
  expected->reformedQuery = "create table foo(a,b);";
  checkQueryInfo(result, expected, err);

  result = cfsql_queryInfo("create table main.foo (a, b);", &err);
  // printf("R: %s\n", result->tblName);
  expected->reformedQuery = "create table main.foo(a,b);";
  expected->schemaName = "main";
  checkQueryInfo(result, expected, err);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void cfsqlQueryInfoTestSuite()
{
  printf("\e[47m\e[1;30mSuite: QueryInfo\e[0m\n");
  testQueryInfo();
}