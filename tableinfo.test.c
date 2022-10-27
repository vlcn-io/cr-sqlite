#include "crsqlite.h"
#include "tableinfo.h"
#include "util.h"
#include "consts.h"
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

static void testGetTableInfo()
{
  printf("GetTableInfo\n");
  sqlite3 *db = 0;
  crsql_TableInfo *tableInfo = 0;
  char *errMsg = 0;
  int rc = SQLITE_OK;

  rc = sqlite3_open(":memory:", &db);

  sqlite3_exec(db, "CREATE TABLE foo (a INT NOT NULL, b)", 0, 0, 0);
  rc = crsql_getTableInfo(db, "foo", &tableInfo, &errMsg);

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

  crsql_freeTableInfo(tableInfo);

  sqlite3_exec(db, "CREATE TABLE bar (a PRIMARY KEY, b)", 0, 0, 0);
  rc = crsql_getTableInfo(db, "bar", &tableInfo, &errMsg);
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

  assert(tableInfo->indexInfoLen == 1);
  assert(strcmp(tableInfo->indexInfo[0].indexedCols[0], "a") == 0);

  crsql_freeTableInfo(tableInfo);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testExtractBaseCols()
{
  int numInfos = 4;
  crsql_ColumnInfo colInfos[numInfos];
  crsql_ColumnInfo *extracted;
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
  }

  extracted = crsql_extractBaseCols(colInfos, numInfos, &extractedLen);
  assert(extractedLen == 4);

  for (i = 0; i < numInfos; ++i)
  {
    crsql_freeColumnInfoContents(&colInfos[i]);
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
    if (i % 2 == 1)
    {
      colInfos[i].versionOf = colInfos[i - 1].name;
    }
    else
    {
      colInfos[i].versionOf = 0;
    }
  }

  extracted = crsql_extractBaseCols(colInfos, numInfos, &extractedLen);
  assert(extractedLen == 2);

  for (i = 0; i < numInfos; ++i)
  {
    crsql_freeColumnInfoContents(&colInfos[i]);
  }
  sqlite3_free(extracted);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testAsIdentifierList()
{
  printf("AsIdentifierList\n");

  crsql_ColumnInfo tc1[3];
  tc1[0].name = "one";
  tc1[1].name = "two";
  tc1[2].name = "three";

  crsql_ColumnInfo tc2[0];

  crsql_ColumnInfo tc3[1];
  tc3[0].name = "one";
  char *result;

  result = crsql_asIdentifierList(tc1, 3, 0);
  assert(strcmp(result, "\"one\",\"two\",\"three\"") == 0);
  sqlite3_free(result);

  result = crsql_asIdentifierList(tc2, 0, 0);
  assert(result == 0);
  sqlite3_free(result);

  result = crsql_asIdentifierList(tc3, 1, 0);
  assert(strcmp(result, "\"one\"") == 0);
  sqlite3_free(result);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testGetIndexList() {
  printf("GetIndexList\n");
  sqlite3 *db = 0;
  crsql_IndexInfo *indexInfos;
  int indexInfosLen;
  int rc = sqlite3_open(":memory:", &db);

  sqlite3_exec(db, "CREATE TABLE foo (a)", 0, 0, 0);

  rc = crsql_getIndexList(
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

  rc = crsql_getIndexList(
    db,
    "bar",
    &indexInfos,
    &indexInfosLen,
    0
  );

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

static void testFindTableInfo() {
  printf("FindTableInfo\n");

  crsql_TableInfo** tblInfos = sqlite3_malloc(3 * sizeof(crsql_TableInfo*));
  for (int i = 0; i < 3; ++i) {
    tblInfos[i] = sqlite3_malloc(sizeof(crsql_TableInfo));
    tblInfos[i]->tblName = sqlite3_mprintf("%d", i);
  }

  assert(crsql_findTableInfo(tblInfos, 3, "0") == tblInfos[0]);
  assert(crsql_findTableInfo(tblInfos, 3, "1") == tblInfos[1]);
  assert(crsql_findTableInfo(tblInfos, 3, "2") == tblInfos[2]);
  assert(crsql_findTableInfo(tblInfos, 3, "3") == 0);

  for (int i = 0; i < 3; ++i) {
    sqlite3_free(tblInfos[i]);
  }
  sqlite3_free(tblInfos);

  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testQuoteConcat() {
  printf("QuoteConcat\n");

  int len = 3;
  crsql_ColumnInfo colInfos[3];

  colInfos[0].name = "a";
  colInfos[1].name = "b";
  colInfos[2].name = "c";

  char *quoted = crsql_quoteConcat(colInfos, len);

  assert(strcmp(quoted, "quote(\"a\") || '~''~' || quote(\"b\") || '~''~' || quote(\"c\")") == 0);

  sqlite3_free(quoted);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void crsqlTableInfoTestSuite() {
  printf("\e[47m\e[1;30mSuite: crsql_tableInfo\e[0m\n");

  testAsIdentifierList();
  testExtractBaseCols();
  testGetTableInfo();
  testGetIndexList();
  testFindTableInfo();
  testQuoteConcat();
  // testPullAllTableInfos();

  // TODO: memory test -- allocate and deallocate no leaks.
}