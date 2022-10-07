#include "cfsqlite.h"
#include "cfsqlite-tableinfo.h"
#include "cfsqlite-util.h"
#include "cfsqlite-consts.h"
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

void testGetTableInfo()
{
  printf("GetTableInfo\n");
  sqlite3 *db = 0;
  cfsql_TableInfo *tableInfo = 0;
  char *errMsg = 0;
  int rc = SQLITE_OK;

  rc = sqlite3_open(":memory:", &db);

  sqlite3_exec(db, "CREATE TABLE foo (a INT NOT NULL, b)", 0, 0, 0);
  rc = cfsql_getTableInfo(db, USER_SPACE, "foo", &tableInfo, &errMsg);

  if (rc != SQLITE_OK)
  {
    printf("err: %s %d\n", errMsg, rc);
    sqlite3_free(errMsg);
    assert(0);
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
    assert(0);
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

void testGetIndexList() {
  printf("GetIndexList\n");
  sqlite3 *db = 0;
  cfsql_IndexInfo *indexInfos;
  int indexInfosLen;
  int rc = sqlite3_open(":memory:", &db);

  sqlite3_exec(db, "CREATE TABLE foo (a)", 0, 0, 0);

  rc = cfsql_getIndexList(
    db,
    "foo",
    &indexInfos,
    &indexInfosLen,
    0
  );

  assert(rc == SQLITE_OK);
  assert(indexInfos == 0);
  assert(indexInfosLen == 0);

  sqlite3_exec(db, "CREATE TABLE bar (a primary key)", 0, 0, 0);

  rc = cfsql_getIndexList(
    db,
    "bar",
    &indexInfos,
    &indexInfosLen,
    0
  );

  printf("rc: %d\n", rc);
  assert(rc == SQLITE_OK);
  assert(indexInfosLen == 1);
  for (int i = 0; i < indexInfosLen; ++i) {
    assert(indexInfos[i].indexedColsLen == 1);
    assert(strcmp(indexInfos[i].indexedCols[0], "a") == 0);
    assert(strcmp(indexInfos[i].origin, "pk") == 0);
    assert(indexInfos[i].unique == 1);
  }

  printf("\t\e[0;32mSuccess\e[0m\n");
}

void cfsqlTableInfoTestSuite() {
  printf("\e[47m\e[1;30mSuite: cfsql_tableInfo\e[0m\n");

  testAsColumnDefinitions();
  testAsIdentifierList();
  testAddVersionCols();
  testExtractBaseCols();
  testGetTableInfo();
  testGetIndexList();
}