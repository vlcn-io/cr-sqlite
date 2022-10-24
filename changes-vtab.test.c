#include "crsqlite.h"
#include "changes-vtab.h"
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
  int failed = 0;
  crsql_TableInfo *tblInfo = 0;
  rc = sqlite3_open(":memory:", &db);

  rc = sqlite3_exec(db, "create table foo (a primary key, b);", 0, 0, &err);
  CHECK_OK
  rc = sqlite3_exec(db, "select crsql_as_crr('foo');", 0, 0, &err);
  CHECK_OK
  rc = crsql_getTableInfo(db, "foo", &tblInfo, &err);
  CHECK_OK

  char *query = crsql_changesQueryForTable(tblInfo);

  assert(strcmp(
    query,
    "SELECT      quote(\"a\") as pks,      \'foo\' as tbl,      json_group_object(__crsql_col_num, __crsql_version) as col_vrsns,      count(__crsql_col_num) as num_cols,      min(__crsql_version) as min_v    FROM \"foo__crsql_clock\"    WHERE      __crsql_site_id != ?    AND      __crsql_version > ?    GROUP BY pks") == 0);
  sqlite3_free(query);

  printf("\t\e[0;32mSuccess\e[0m\n");

fail:
  sqlite3_free(err);
  crsql_freeTableInfo(tblInfo);
  sqlite3_close(db);
  assert(rc == SQLITE_OK);
}

void testChangesUnionQuery()
{
  printf("ChangesUnionQuery\n");

  int rc = SQLITE_OK;
  sqlite3 *db;
  char *err = 0;
  crsql_TableInfo **tblInfos = sqlite3_malloc(2 * sizeof(crsql_TableInfo*));
  rc = sqlite3_open(":memory:", &db);

  rc += sqlite3_exec(db, "create table foo (a primary key, b);", 0, 0, &err);
  rc += sqlite3_exec(db, "create table bar (\"x\" primary key, [y]);", 0, 0, &err);
  rc += sqlite3_exec(db, "select crsql_as_crr('foo');", 0, 0, &err);
  rc += sqlite3_exec(db, "select crsql_as_crr('bar');", 0, 0, &err);
  rc += crsql_getTableInfo(db, "foo", &tblInfos[0], &err);
  rc += crsql_getTableInfo(db, "bar", &tblInfos[1], &err);
  CHECK_OK

  char * query = crsql_changesUnionQuery(tblInfos, 2);

  assert(strcmp(query, "SELECT tbl, pks, num_cols, col_vrsns, min_v FROM (SELECT      quote(\"a\") as pks,      \'foo\' as tbl,      json_group_object(__crsql_col_num, __crsql_version) as col_vrsns,      count(__crsql_col_num) as num_cols,      min(__crsql_version) as min_v    FROM \"foo__crsql_clock\"    WHERE      __crsql_site_id != ?    AND      __crsql_version > ?    GROUP BY pks UNION SELECT      quote(\"x\") as pks,      \'bar\' as tbl,      json_group_object(__crsql_col_num, __crsql_version) as col_vrsns,      count(__crsql_col_num) as num_cols,      min(__crsql_version) as min_v    FROM \"bar__crsql_clock\"    WHERE      __crsql_site_id != ?    AND      __crsql_version > ?    GROUP BY pks) ORDER BY min_v, tbl ASC") == 0);

  printf("\t\e[0;32mSuccess\e[0m\n");

  fail:
  sqlite3_free(err);
  crsql_freeAllTableInfos(tblInfos, 2);
  sqlite3_close(db);
  assert(rc == SQLITE_OK);
}

void testPickColumnInfosFromVersionMap()
{
  printf("PickColumnInfosFromVersionMap\n");

  int rc = SQLITE_OK;
  sqlite3 *db;
  char *err = 0;
  crsql_TableInfo *tblInfo = 0;
  rc = sqlite3_open(":memory:", &db);

  rc += sqlite3_exec(db, "create table foo (a primary key, b, c, d);", 0, 0, &err);
  rc += sqlite3_exec(db, "select crsql_as_crr('foo');", 0, 0, &err);
  rc += crsql_getTableInfo(db, "foo", &tblInfo, &err);
  CHECK_OK

  // TC1: bad json picks no cols
  char *versionMap = "";
  crsql_ColumnInfo *picked = crsql_pickColumnInfosFromVersionMap(
    db,
    tblInfo->baseCols,
    tblInfo->baseColsLen,
    1,
    versionMap
  );
  assert(picked == 0);

  // TC2: empty json obj picks no cols
  versionMap = "{}";
  picked = crsql_pickColumnInfosFromVersionMap(
    db,
    tblInfo->baseCols,
    tblInfo->baseColsLen,
    1,
    versionMap
  );
  assert(picked == 0);

  // TC3: mismatch json and version col length picks no cols
  versionMap = "{\"1\": 1, \"2\": 2}";
  picked = crsql_pickColumnInfosFromVersionMap(
    db,
    tblInfo->baseCols,
    tblInfo->baseColsLen,
    1,
    versionMap
  );
  assert(picked == 0);

  // TC4: more version cols than cols
  versionMap = "{\"1\": 2, \"2\": 3, \"3\": 3, \"4\": 4, \"5\": 5}";
  picked = crsql_pickColumnInfosFromVersionMap(
    db,
    tblInfo->baseCols,
    tblInfo->baseColsLen,
    1,
    versionMap
  );
  assert(picked == 0);

  // TC5: one col change
  versionMap = "{\"1\": 2}";
  picked = crsql_pickColumnInfosFromVersionMap(
    db,
    tblInfo->baseCols,
    tblInfo->baseColsLen,
    1,
    versionMap
  );
  assert(picked != 0);
  assert(picked[0].cid == 1);
  assert(strcmp(picked[0].name, "b") == 0);

  // TC6: two col change
  versionMap = "{\"1\": 2, \"2\": 3}";
  picked = crsql_pickColumnInfosFromVersionMap(
    db,
    tblInfo->baseCols,
    tblInfo->baseColsLen,
    2,
    versionMap
  );
  assert(picked != 0);
  assert(picked[0].cid == 1);
  assert(strcmp(picked[0].name, "b") == 0);
  assert(picked[1].cid == 2);
  assert(strcmp(picked[1].name, "c") == 0);

  // TC7: all col change
  versionMap = "{\"1\": 2, \"2\": 3, \"3\": 4}";
  picked = crsql_pickColumnInfosFromVersionMap(
    db,
    tblInfo->baseCols,
    tblInfo->baseColsLen,
    3,
    versionMap
  );
  assert(picked != 0);
  assert(picked[0].cid == 1);
  assert(strcmp(picked[0].name, "b") == 0);
  assert(picked[1].cid == 2);
  assert(strcmp(picked[1].name, "c") == 0);
  assert(picked[2].cid == 3);
  assert(strcmp(picked[2].name, "d") == 0);

  // TC9: bad cid returns none
  versionMap = "{\"4\": 2}";
  picked = crsql_pickColumnInfosFromVersionMap(
    db,
    tblInfo->baseCols,
    tblInfo->baseColsLen,
    1,
    versionMap
  );
  assert(picked == 0);

  // TC10: last col change
  versionMap = "{\"3\": 3}";
  picked = crsql_pickColumnInfosFromVersionMap(
    db,
    tblInfo->baseCols,
    tblInfo->baseColsLen,
    1,
    versionMap
  );
  assert(picked != 0);
  assert(picked[0].cid == 3);
  assert(strcmp(picked[0].name, "d") == 0);

  // TC11: includes delete record

  printf("\t\e[0;32mSuccess\e[0m\n");

  fail:
  sqlite3_free(err);
  crsql_freeTableInfo(tblInfo);
  sqlite3_close(db);
  assert(rc == SQLITE_OK);
}

void testRowPatchDataQuery()
{
  printf("RowPatchDataQuery\n");

  int rc = SQLITE_OK;
  sqlite3 *db;
  char *err = 0;
  crsql_TableInfo *tblInfo = 0;
  rc = sqlite3_open(":memory:", &db);

  rc += sqlite3_exec(db, "create table foo (a primary key, b, c, d);", 0, 0, &err);
  rc += sqlite3_exec(db, "select crsql_as_crr('foo');", 0, 0, &err);
  rc += sqlite3_exec(db, "insert into foo values(1, 'cb', 'cc', 'cd')", 0, 0, &err);
  rc += crsql_getTableInfo(db, "foo", &tblInfo, &err);
  CHECK_OK

  // TC1: single pk table, 1 col change
  char *versions = "{\"1\": 1}";
  char *pks = "1";
  char *q = crsql_rowPatchDataQuery(db, tblInfo, 1, versions, pks);
  assert(strcmp(q, "SELECT quote(\"b\") FROM \"foo\" WHERE \"a\" = 1") == 0);
  sqlite3_free(q);

  printf("\t\e[0;32mSuccess\e[0m\n");

  fail:
  sqlite3_free(err);
  crsql_freeTableInfo(tblInfo);
  sqlite3_close(db);
  assert(rc == SQLITE_OK);
}

void crsqlChagesSinceVtabTestSuite()
{
  printf("\e[47m\e[1;30mSuite: crsql_changesVtab\e[0m\n");
  testChangesQueryForTable();
  testChangesUnionQuery();
  testPickColumnInfosFromVersionMap();
  testRowPatchDataQuery();
}

// TODO: mem debugging
// https://stackoverflow.com/questions/2980917/c-is-it-possible-to-implement-memory-leak-testing-in-a-unit-test