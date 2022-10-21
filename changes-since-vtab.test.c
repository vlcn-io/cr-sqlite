#include "cfsqlite.h"
#include "changes-since-vtab.h"
#include "consts.h"
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

#ifndef CHECK_OK
#define CHECK_OK       \
  if (rc != SQLITE_OK) \
  {                    \
    goto fail;         \
  }
#endif

void testChangesQueryForTable()
{
  printf("ChangeQueryForTable\n");
  int rc = SQLITE_OK;
  sqlite3 *db;
  char *err = 0;
  cfsql_TableInfo *tblInfo = 0;
  rc = sqlite3_open(":memory:", &db);

  rc = sqlite3_exec(db, "create table foo (a primary key, b);", 0, 0, &err);
  CHECK_OK
  rc = sqlite3_exec(db, "select cfsql_as_crr('foo');", 0, 0, &err);
  CHECK_OK
  rc = cfsql_getTableInfo(db, "foo", &tblInfo, &err);
  CHECK_OK

  char *query = cfsql_changesQueryForTable(tblInfo);

  assert(strcmp(
    query,
    "SELECT      quote(\"a\") as pks,      'foo' as tbl,      json_group_object(__cfsql_col_num, __cfsql_version) as col_vrsns,      min(__cfsql_version) as min_v    FROM \"foo__cfsql_clock\"    WHERE      __cfsql_site_id != ?    AND      __cfsql_version > ?    GROUP BY pks") == 0);
  sqlite3_free(query);

  printf("\t\e[0;32mSuccess\e[0m\n");
  return;

fail:
  printf("err: %s %d\n", err, rc);
  sqlite3_free(err);
  cfsql_freeTableInfo(tblInfo);
  sqlite3_close(db);
  assert(rc == SQLITE_OK);
}

void testChangesUnionQuery()
{
  printf("ChangesUnionQuery\n");

  int rc = SQLITE_OK;
  sqlite3 *db;
  char *err = 0;
  cfsql_TableInfo **tblInfos = sqlite3_malloc(2 * sizeof(cfsql_TableInfo*));
  rc = sqlite3_open(":memory:", &db);

  rc += sqlite3_exec(db, "create table foo (a primary key, b);", 0, 0, &err);
  rc += sqlite3_exec(db, "create table bar (\"x\" primary key, [y]);", 0, 0, &err);
  rc += sqlite3_exec(db, "select cfsql_as_crr('foo');", 0, 0, &err);
  rc += sqlite3_exec(db, "select cfsql_as_crr('bar');", 0, 0, &err);
  rc += cfsql_getTableInfo(db, "foo", &tblInfos[0], &err);
  rc += cfsql_getTableInfo(db, "bar", &tblInfos[1], &err);
  CHECK_OK

  char * query = cfsql_changesUnionQuery(tblInfos, 2);

  assert(strcmp(query, "SELECT tbl, pks, col_vrsns, min_v FROM (SELECT      quote(\"a\") as pks,      \'foo\' as tbl,      json_group_object(__cfsql_col_num, __cfsql_version) as col_vrsns,      min(__cfsql_version) as min_v    FROM \"foo__cfsql_clock\"    WHERE      __cfsql_site_id != ?    AND      __cfsql_version > ?    GROUP BY pks UNION SELECT      quote(\"x\") as pks,      \'bar\' as tbl,      json_group_object(__cfsql_col_num, __cfsql_version) as col_vrsns,      min(__cfsql_version) as min_v    FROM \"bar__cfsql_clock\"    WHERE      __cfsql_site_id != ?    AND      __cfsql_version > ?    GROUP BY pks) ORDER BY min_v, tbl ASC") == 0);

  printf("\t\e[0;32mSuccess\e[0m\n");
  return;

  fail:
  printf("err: %s %d\n", err, rc);
  sqlite3_free(err);
  cfsql_freeAllTableInfos(tblInfos, 2);
  sqlite3_close(db);
  assert(rc == SQLITE_OK);
}

void testPickColumnInfosFromVersionMap()
{
  printf("PickColumnInfosFromVersionMap\n");
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void testRowPatchDataQuery()
{
  printf("RowPatchDataQuery\n");
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void cfsqlChagesSinceVtabTestSuite()
{
  printf("\e[47m\e[1;30mSuite: cfsql_changesSinceVtab\e[0m\n");
  testChangesQueryForTable();
  testChangesUnionQuery();
  printf("\t\e[0;32mSuccess\e[0m\n");
}

// TODO: mem debugging
// https://stackoverflow.com/questions/2980917/c-is-it-possible-to-implement-memory-leak-testing-in-a-unit-test