#include "cfsqlite.h"

#include "cfsqlite-util.h"
#include "cfsqlite-consts.h"
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

#define CHECK_OK if (rc != SQLITE_OK) { goto fail; }

// TODO: use a real unit test framework
// TODO: updated to use property based testing: https://github.com/silentbicycle/theft
void testExtractWord()
{
  char *word;
  int res;

  printf("ExtractWord\n");
  word = cfsql_extractWord(0, "hello there");
  assert(strcmp(word, "hello") == 0);
  sqlite3_free(word);

  word = cfsql_extractWord(6, "hello there");
  assert(strcmp(word, "there") == 0);
  sqlite3_free(word);

  word = cfsql_extractWord(CREATE_TEMP_TABLE_CFSQL_LEN, "CREATE TEMP TABLE cfsql_temp__foo ");
  assert(strcmp(word, "foo") == 0);
  sqlite3_free(word);

  word = cfsql_extractWord(CREATE_TEMP_TABLE_CFSQL_LEN, "CREATE TEMP TABLE cfsql_temp__foo");
  assert(strcmp(word, "foo") == 0);
  sqlite3_free(word);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testGetVersionUnionQuery()
{
  int numRows_tc1 = 1;
  char *tableNames_tc1[] = {
      "tbl_name",
      "foo",
  };
  int numRows_tc2 = 3;
  char *tableNames_tc2[] = {
      "tbl_name",
      "foo",
      "bar",
      "baz"};
  char *query;
  printf("GetVersionUnionQuery\n");

  query = cfsql_getDbVersionUnionQuery(
      numRows_tc1,
      tableNames_tc1);
  assert(strcmp(query, "SELECT max(version) FROM (SELECT max(version) FROM \"foo\" WHERE site_id = ?  )") == 0);
  sqlite3_free(query);

  query = cfsql_getDbVersionUnionQuery(
      numRows_tc2,
      tableNames_tc2);
  assert(strcmp(query, "SELECT max(version) FROM (SELECT max(version) FROM \"foo\" WHERE site_id = ? UNION SELECT max(version) FROM \"bar\" WHERE site_id = ? UNION SELECT max(version) FROM \"baz\" WHERE site_id = ?  )") == 0);
  sqlite3_free(query);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testDoesTableExist()
{
  sqlite3 *db;
  int rc;
  printf("DoesTableExist\n");

  rc = sqlite3_open(":memory:", &db);
  if (rc)
  {
    fprintf(stderr, "Can't open database: %s\n", sqlite3_errmsg(db));
    sqlite3_close(db);
    return;
  }

  assert(cfsql_doesTableExist(db, "foo") == 0);
  sqlite3_exec(db, "CREATE TABLE foo (a, b)", 0, 0, 0);
  assert(cfsql_doesTableExist(db, "foo") == 1);

  sqlite3_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testGetCount()
{
  sqlite3 *db = 0;
  int rc = SQLITE_OK;
  printf("GetCount\n");

  rc = sqlite3_open(":memory:", &db);
  sqlite3_exec(db, "CREATE TABLE foo (a); INSERT INTO foo VALUES (1);", 0, 0, 0);
  rc = cfsql_getCount(db, "SELECT count(*) FROM foo");

  assert(rc == 1);
  sqlite3_exec(db, "INSERT INTO foo VALUES (1);", 0, 0, 0);
  rc = cfsql_getCount(db, "SELECT count(*) FROM foo");
  assert(rc == 2);

  sqlite3_close(db);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testGetTableInfo()
{
  sqlite3 *db = 0;
  cfsql_TableInfo *tableInfo = 0;
  char *errMsg = 0;
  int rc = SQLITE_OK;
  printf("GetTableInfo\n");

  rc = sqlite3_open(":memory:", &db);

  sqlite3_exec(db, "CREATE TABLE foo (a INT NOT NULL, b)", 0, 0, 0);
  rc = cfsql_getTableInfo(db, USER_SPACE, "foo", &tableInfo, &errMsg);

  if (rc != SQLITE_OK)
  {
    printf("err: %s %d\n", errMsg, rc);
    sqlite3_free(errMsg);
    return;
  }

  assert(tableInfo->baseColsLen == 2);
  assert(tableInfo->baseCols[0].cid == 0);
  assert(strcmp(tableInfo->baseCols[0].name, "a") == 0);
  assert(strcmp(tableInfo->baseCols[0].type, "INT") == 0);
  assert(tableInfo->baseCols[0].notnull == 1);
  assert(tableInfo->baseCols[0].pk == 0);

  assert(tableInfo->pksLen == 0);
  assert(tableInfo->pks == 0);

  assert(tableInfo->nonPksLen == 2);
  assert(tableInfo->nonPks[0].cid == 0);
  assert(strcmp(tableInfo->nonPks[0].name, "a") == 0);
  assert(strcmp(tableInfo->nonPks[0].type, "INT") == 0);
  assert(tableInfo->nonPks[0].notnull == 1);
  assert(tableInfo->nonPks[0].pk == 0);

  assert(tableInfo->withVersionColsLen == 4);

  cfsql_freeTableInfo(tableInfo);

  sqlite3_exec(db, "CREATE TABLE bar (a PRIMARY KEY, b)", 0, 0, 0);
  rc = cfsql_getTableInfo(db, USER_SPACE, "bar", &tableInfo, &errMsg);
  if (rc != SQLITE_OK)
  {
    printf("err: %s %d\n", errMsg, rc);
    sqlite3_free(errMsg);
    return;
  }

  assert(tableInfo->baseColsLen == 2);
  assert(tableInfo->baseCols[0].cid == 0);
  assert(strcmp(tableInfo->baseCols[0].name, "a") == 0);
  assert(strcmp(tableInfo->baseCols[0].type, "") == 0);
  assert(tableInfo->baseCols[0].notnull == 0);
  assert(tableInfo->baseCols[0].pk == 1);

  assert(tableInfo->pksLen == 1);
  assert(tableInfo->nonPksLen == 1);

  assert(tableInfo->withVersionColsLen == 3);

  cfsql_freeTableInfo(tableInfo);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testExtractBaseCols()
{
  int numInfos = 4;
  cfsql_ColumnInfo colInfos[numInfos];
  cfsql_ColumnInfo *extracted;
  int i = 0;
  int extractedLen = 0;
  printf("ExtractBaseCols\n");

  // no columns are version columns
  for (i = 0; i < numInfos; ++i)
  {
    colInfos[i].cid = i;
    colInfos[i].name = sqlite3_mprintf("c_%d", i);
    colInfos[i].type = sqlite3_mprintf("");
    colInfos[i].notnull = 0;
    colInfos[i].pk = 0;
    colInfos[i].versionOf = 0;
    colInfos[i].dfltValue = 0;
  }

  extracted = cfsql_extractBaseCols(colInfos, numInfos, &extractedLen);
  assert(extractedLen == 4);

  for (i = 0; i < numInfos; ++i)
  {
    cfsql_freeColumnInfoContents(&colInfos[i]);
  }
  sqlite3_free(extracted);

  // every other column is a version column
  for (i = 0; i < numInfos; ++i)
  {
    colInfos[i].cid = i;
    colInfos[i].name = sqlite3_mprintf("c_%d", i);
    colInfos[i].type = sqlite3_mprintf("");
    colInfos[i].notnull = 0;
    colInfos[i].pk = 0;
    colInfos[i].dfltValue = 0;
    if (i % 2 == 1)
    {
      colInfos[i].versionOf = colInfos[i - 1].name;
    }
    else
    {
      colInfos[i].versionOf = 0;
    }
  }

  extracted = cfsql_extractBaseCols(colInfos, numInfos, &extractedLen);
  assert(extractedLen == 2);

  for (i = 0; i < numInfos; ++i)
  {
    cfsql_freeColumnInfoContents(&colInfos[i]);
  }
  sqlite3_free(extracted);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testAddVersionCols()
{
  int numInfos = 4;
  cfsql_ColumnInfo colInfos[numInfos];
  cfsql_ColumnInfo *versioned;
  int i = 0;
  int versionedLen = 0;
  printf("AddVersionCols\n");

  // no columns are version columns
  for (i = 0; i < numInfos; ++i)
  {
    colInfos[i].cid = i;
    colInfos[i].name = sqlite3_mprintf("c_%d", i);
    colInfos[i].type = sqlite3_mprintf("");
    colInfos[i].notnull = 0;
    colInfos[i].pk = 0;
    colInfos[i].versionOf = 0;
    colInfos[i].dfltValue = 0;
  }

  versioned = cfsql_addVersionCols(colInfos, numInfos, &versionedLen);
  assert(versionedLen == 8);
  for (i = 0; i < versionedLen; ++i)
  {
    if (i % 2 == 1)
    {
      assert(versioned[i].versionOf != 0);
      assert(versioned[i].cid == -1);
    }
    else
    {
      assert(versioned[i].versionOf == 0);
    }

    cfsql_freeColumnInfoContents(&versioned[i]);
  }
  sqlite3_free(versioned);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testAsIdentifierList()
{
  printf("AsIdentifierList\n");

  cfsql_ColumnInfo tc1[3];
  tc1[0].name = "one";
  tc1[1].name = "two";
  tc1[2].name = "three";

  cfsql_ColumnInfo tc2[0];

  cfsql_ColumnInfo tc3[1];
  tc3[0].name = "one";
  char *result;

  result = cfsql_asIdentifierList(tc1, 3);
  assert(strcmp(result, "\"one\",\"two\",\"three\"") == 0);
  sqlite3_free(result);

  result = cfsql_asIdentifierList(tc2, 0);
  assert(result == 0);
  sqlite3_free(result);

  result = cfsql_asIdentifierList(tc3, 1);
  assert(strcmp(result, "\"one\"") == 0);
  sqlite3_free(result);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

// TODO: rename to `cfsqlite.test.c` since we test more then util
void testCreateClockTable()
{
  printf("CreateClockTable\n");

  sqlite3 *db;
  int rc;
  cfsql_TableInfo *tc1;
  cfsql_TableInfo *tc2;
  cfsql_TableInfo *tc3;
  cfsql_TableInfo *tc4;
  char *err = 0;

  rc = sqlite3_open(":memory:", &db);
  sqlite3_exec(db, "CREATE TABLE foo (a)", 0, 0, 0);
  sqlite3_exec(db, "CREATE TABLE bar (a primary key)", 0, 0, 0);
  sqlite3_exec(db, "CREATE TABLE baz (a primary key, b)", 0, 0, 0);
  sqlite3_exec(db, "CREATE TABLE boo (a primary key, b, c)", 0, 0, 0);

  rc = cfsql_getTableInfo(db, USER_SPACE, "foo", &tc1, &err);
  CHECK_OK
  rc = cfsql_getTableInfo(db, USER_SPACE, "bar", &tc2, &err);
  CHECK_OK
  rc = cfsql_getTableInfo(db, USER_SPACE, "baz", &tc3, &err);
  CHECK_OK
  rc = cfsql_getTableInfo(db, USER_SPACE, "boo", &tc4, &err);
  CHECK_OK

  rc = cfsql_createClockTable(db, tc1, &err);
  CHECK_OK
  rc = cfsql_createClockTable(db, tc2, &err);
  CHECK_OK
  rc = cfsql_createClockTable(db, tc3, &err);
  CHECK_OK
  rc = cfsql_createClockTable(db, tc4, &err);
  CHECK_OK

  // TODO: check that the tables have the expected schema

  printf("\t\e[0;32mSuccess\e[0m\n");
  return;

  fail:
  printf("err: %s %d\n", err, rc);
  sqlite3_free(err);
  assert(rc == SQLITE_OK);
}

void testJoinWith() {
  printf("JoinWith\n");
  char dest[13];
  char *src[] = {
    "one",
    "two",
    "four"
  };

  cfsql_joinWith(dest, src, 3, ',');

  assert(strcmp(dest, "one,two,four") == 0);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testAsColumnDefinitions() {
  printf("AsColumnDefinitions\n");

  int numInfos = 4;
  cfsql_ColumnInfo colInfos[numInfos];
  for (int i = 0; i < numInfos; ++i)
  {
    colInfos[i].cid = i;
    colInfos[i].name = sqlite3_mprintf("c_%d", i);
    colInfos[i].type = sqlite3_mprintf("");
    colInfos[i].notnull = 0;
    colInfos[i].pk = 0;
    colInfos[i].versionOf = 0;
    colInfos[i].dfltValue = 0;
  }

  char * defs = cfsql_asColumnDefinitions(colInfos, numInfos);
  assert(strcmp(defs, "\"c_0\"  ,\"c_1\"  ,\"c_2\"  ,\"c_3\"  ") == 0);
  sqlite3_free(defs);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testCreateCrrBaseTable() {

}

void testCreateViewOfCrr() {

}

int main(int argc, char *argv[])
{
  testExtractWord();
  testGetVersionUnionQuery();
  testDoesTableExist();
  testGetCount();
  testGetTableInfo();
  testExtractBaseCols();
  testAddVersionCols();
  testAsIdentifierList();
  testCreateClockTable();
  testJoinWith();
  testAsColumnDefinitions();
  testCreateCrrBaseTable();
  testCreateViewOfCrr();

  // TODO: test pk pulling and correct sorting of pks
  // TODO: create a fn to create test tables for all tests.
}
