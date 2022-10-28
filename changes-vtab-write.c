#include <string.h>
#include "changes-vtab-write.h"
#include "consts.h"
#include "crsqlite.h"
#include "tableinfo.h"
#include "changes-vtab.h"
#include "changes-vtab-common.h"
#include "util.h"

/**
 * Given a json map of received col versions,
 * return an array indexed by cid that contains the index
 * of the received col version.
 *
 * Returns r[0] = -1 on delete
 *
 * Returns 0 on failure.
 *
 * totalNumCols represents the max number of columns in the table.
 * rNumReceivedCids is the number of columns in the change.
 */
int *crsql_allReceivedCids(
    sqlite3 *db,
    const unsigned char *colVrsns,
    int totalNumCols,
    int *rNumReceivedCids)
{
  int rc = SQLITE_OK;
  sqlite3_stmt *pStmt = 0;
  char *zSql = sqlite3_mprintf("SELECT key as cid FROM json_each(%Q)", colVrsns);
  rc = sqlite3_prepare(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    sqlite3_finalize(pStmt);
    return 0;
  }

  int *ret = sqlite3_malloc(totalNumCols * sizeof *ret);
  for (int i = 0; i < totalNumCols; ++i)
  {
    // -2 => unmapped
    // -1 => full row delete
    ret[i] = -2;
  }
  int numReceivedCids = 0;
  rc = sqlite3_step(pStmt);
  while (rc == SQLITE_ROW)
  {
    int cid = sqlite3_column_int(pStmt, 0);
    if (cid == DELETE_CID_SENTINEL)
    {
      sqlite3_finalize(pStmt);
      ret[0] = -1;
      return ret;
    }
    if (cid >= totalNumCols || numReceivedCids >= totalNumCols || cid < 0)
    {
      sqlite3_free(ret);
      sqlite3_finalize(pStmt);
      return 0;
    }
    ret[cid] = numReceivedCids;
    ++numReceivedCids;
    rc = sqlite3_step(pStmt);
  }

  if (rc != SQLITE_DONE)
  {
    sqlite3_free(ret);
    sqlite3_finalize(pStmt);
    return 0;
  }

  *rNumReceivedCids = numReceivedCids;
  return ret;
}

char *crsql_changesTabConflictSets(
    char **allWinningVals,
    crsql_ColumnInfo *columnInfosForInsert,
    int allWinningValsLen)
{
  return 0;
}

/**
 * Given a json map of received col versions,
 * return an array of the cids that should actually
 * overwrite values on the local db.
 *
 * Note that this is different from `allReceivedCids` which returns
 * an array indexed by cid containing index locations of the
 * col version.
 *
 * This is a regular array containing cids.
 *
 * The former is used for extracting data from concatenated col vals.
 */
int *crsql_allWinningCids(
    sqlite3 *db,
    const unsigned char *insertColVrsns,
    const unsigned char *insertTbl,
    const char *pkWhereList,
    int totalNumCols,
    int *rlen,
    const void *insertSiteId,
    int insertSiteIdLen,
    char **errmsg)
{
  char *zSql = 0;
  int siteComparison = crsql_siteIdCmp(insertSiteId, insertSiteIdLen, crsql_siteIdBlob, crsql_siteIdBlobSize);

  if (siteComparison == 0)
  {
    // we're patching into our own site? Makes no sense.
    *errmsg = sqlite3_mprintf("crsql - a site is trying to patch itself.");
    return 0;
  }

  if (siteComparison > 0)
  {
    zSql = sqlite3_mprintf(
        "SELECT key as cid FROM json_each(%Q)\
          LEFT JOIN \"%s__crsql_clock\"\
          WHERE %z AND value >= \"%s__crsql_clock\".__crsql_version",
        insertColVrsns,
        insertTbl,
        pkWhereList,
        insertTbl);
  }
  else if (siteComparison < 0)
  {
    zSql = sqlite3_mprintf(
        "SELECT key as cid FROM json_each(%Q)\
          LEFT JOIN \"%s__crsql_clock\"\
          WHERE %z AND value > \"%s__crsql_clock\".__crsql_version",
        insertColVrsns,
        insertTbl,
        pkWhereList,
        insertTbl);
  }
  else
  {
    // should be impossible given prior siteComparison == 0 if statement
    return 0;
  }

  // run zSql
  sqlite3_stmt *pStmt = 0;
  int rc = sqlite3_prepare(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    sqlite3_finalize(pStmt);
    return 0;
  }

  int *ret = sqlite3_malloc(totalNumCols * sizeof *ret);
  memset(ret, 0, totalNumCols * sizeof *ret);
  rc = sqlite3_step(pStmt);
  int i = 0;
  while (rc == SQLITE_ROW)
  {
    int cid = sqlite3_column_int(pStmt, 0);
    if (cid > totalNumCols || i >= totalNumCols)
    {
      sqlite3_free(ret);
      sqlite3_finalize(pStmt);
      return 0;
    }
    ret[i] = cid;
    ++i;
    rc = sqlite3_step(pStmt);
  }

  if (rc != SQLITE_DONE)
  {
    sqlite3_free(ret);
    sqlite3_finalize(pStmt);
    return 0;
  }

  return ret;
}

#define DELETED_LOCALLY -1
int crsql_checkForLocalDelete(
    sqlite3 *db,
    const char *tblName,
    char *pkWhereList)
{
  char *zSql = sqlite3_mprintf(
      "SELECT count(*) FROM \"%s__crsql_clock\" WHERE %s AND __crsql_col_num = %d",
      tblName,
      pkWhereList,
      DELETE_CID_SENTINEL);
  sqlite3_stmt *pStmt;
  int rc = sqlite3_prepare(db, zSql, -1, &pStmt, 0);
  sqlite3_free(zSql);

  if (rc != SQLITE_OK)
  {
    sqlite3_finalize(pStmt);
    return rc;
  }

  rc = sqlite3_step(pStmt);
  if (rc != SQLITE_ROW)
  {
    sqlite3_finalize(pStmt);
    return SQLITE_ERROR;
  }

  int count = sqlite3_column_int(pStmt, 0);
  sqlite3_finalize(pStmt);
  if (count == 1)
  {
    return DELETED_LOCALLY;
  }

  return SQLITE_OK;
}

int crsql_mergeDelete(
    sqlite3 *db,
    const char *tblName,
    char *pkWhereList,
    char *pkValsStr)
{
  // rc = sqlite3_exec(db, SET_SYNC_BIT, 0, 0, errmsg);
  // merging delete needs to create a record of the delete in the clock table
  // we know we don't have one b/c we checked for it prior to being here.
  // so just:
  // 1. delete from main table where pkWhereList
  // 2. insert into clock table pkVals, col_num = sentinel_delete, version=curr_db_version, site_id=provided_id

  return SQLITE_OK;
}

int crsql_mergeInsert(
    sqlite3_vtab *pVTab,
    int argc,
    sqlite3_value **argv,
    sqlite3_int64 *pRowid,
    char **errmsg)
{
  // he argv[1] parameter is the rowid of a new row to be inserted into the virtual table.
  // If argv[1] is an SQL NULL, then the implementation must choose a rowid for the newly inserted row
  int rowidType = sqlite3_value_type(argv[1]);
  int rc = 0;
  crsql_Changes_vtab *pTab = (crsql_Changes_vtab *)pVTab;
  sqlite3 *db = pTab->db;
  char *zSql = 0;
  int ignore = 0;

  // column values exist in argv[2] and following.
  const int insertTblLen = sqlite3_value_bytes(argv[2 + CHANGES_SINCE_VTAB_TBL]);
  if (insertTblLen > MAX_TBL_NAME_LEN)
  {
    *errmsg = sqlite3_mprintf("crsql - table name exceeded max length");
    return SQLITE_ERROR;
  }
  // safe given we only use this if it exactly matches a table name
  // from tblInfo
  const unsigned char *insertTbl = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_TBL]);
  // `splitQuoteConcat` will validate these
  const unsigned char *insertPks = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_PK]);
  // `splitQuoteConcat` will validate these
  const unsigned char *insertVals = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_COL_VALS]);
  // safe given we only use via %Q and json processing
  const unsigned char *insertColVrsns = sqlite3_value_text(argv[2 + CHANGES_SINCE_VTAB_COL_VRSNS]);
  // sqlite3_int64 insertVrsn = sqlite3_value_int64(argv[2 + CHANGES_SINCE_VTAB_VRSN]);
  int insertSiteIdLen = sqlite3_value_bytes(argv[2 + CHANGES_SINCE_VTAB_SITE_ID]);
  if (insertSiteIdLen > SITE_ID_LEN)
  {
    *errmsg = sqlite3_mprintf("crsql - site id exceeded max length");
    return SQLITE_ERROR;
  }
  // safe given we only use siteid via `bind`
  const void *insertSiteId = sqlite3_value_blob(argv[2 + CHANGES_SINCE_VTAB_SITE_ID]);

  crsql_TableInfo *tblInfo = crsql_findTableInfo(pTab->tableInfos, pTab->tableInfosLen, (const char *)insertTbl);
  if (tblInfo == 0)
  {
    *errmsg = sqlite3_mprintf("crsql - could not find the schema information for table %s", insertTbl);
    return SQLITE_ERROR;
  }

  char *pkWhereList = crsql_extractWhereList(tblInfo->pks, tblInfo->pksLen, (const char *)insertPks);
  if (pkWhereList == 0)
  {
    *errmsg = sqlite3_mprintf("crsql - failed decoding primary keys for insert");
    return SQLITE_ERROR;
  }

  rc = crsql_checkForLocalDelete(db, tblInfo->tblName, pkWhereList);
  if (rc == DELETED_LOCALLY)
  {
    rc = SQLITE_OK;
    // delete wins. we're all done.
    sqlite3_free(pkWhereList);
    return rc;
  }

  int numReceivedCids = 0;
  int *allReceivedCidsToIdx = crsql_allReceivedCids(db, insertColVrsns, tblInfo->baseColsLen, &numReceivedCids);

  if (allReceivedCidsToIdx == 0)
  {
    sqlite3_free(pkWhereList);
    sqlite3_free(allReceivedCidsToIdx);
    *errmsg = sqlite3_mprintf("crsql - failed to extract cids of changed columns");
    return SQLITE_ERROR;
  }

  // This happens if the state is a delete
  // We must `checkForLocalDelete` prior to merging a delete (happens above).
  // mergeDelete assumes we've already checked for a local delete.
  char *pkValsStr = crsql_quoteConcatedValuesAsList((const char*)insertPks, tblInfo->pksLen);
  if (pkValsStr == 0)
  {
    sqlite3_free(pkWhereList);
    sqlite3_free(allReceivedCidsToIdx);
    return SQLITE_ERROR;
  }
  if (allReceivedCidsToIdx[0] == -1)
  {
    rc = crsql_mergeDelete(db, tblInfo->tblName, pkWhereList, pkValsStr);

    sqlite3_free(pkWhereList);
    sqlite3_free(pkValsStr);
    sqlite3_free(allReceivedCidsToIdx);
    return rc;
  }

  // if (numReceivedCids == 0) {
  //   // on conflict ignore this.
  //   rc = crsql_processPkOnlyInsert(db, tblInfo->tblName, tblInfo->pks, tblInfo->pksLen, insertPks);
  // }

  // process normal merge

  int allWinningCidsLen = 0;
  int *allWinningCids = crsql_allWinningCids(
      db,
      insertColVrsns,
      insertTbl,
      pkWhereList,
      tblInfo->baseColsLen,
      &allWinningCidsLen,
      insertSiteId,
      insertSiteIdLen,
      errmsg);

  if (allWinningCids == 0 || allWinningCidsLen + tblInfo->pksLen > tblInfo->baseColsLen || allWinningCidsLen == 0)
  {
    sqlite3_free(allReceivedCidsToIdx);
    sqlite3_free(allWinningCids);
    sqlite3_free(pkValsStr);
    sqlite3_free(pkWhereList);
    // allWinningCidsLen == 0? compared against our clocks, nothing wins. OK and Done.
    return allWinningCidsLen == 0 && allWinningCids != 0 ? SQLITE_OK : SQLITE_ERROR;
  }

  // crsql_insertWinningChanges();
  // move all code below into insertWinningChanges

  crsql_ColumnInfo columnInfosForInsert[allWinningCidsLen];
  char **allReceivedNonPkVals = crsql_splitQuoteConcat((const char *)insertVals, numReceivedCids);
  char *allWinningVals[allWinningCidsLen];

  if (allReceivedNonPkVals == 0)
  {
    sqlite3_free(allReceivedCidsToIdx);
    sqlite3_free(allWinningCids);
    sqlite3_free(pkValsStr);
    sqlite3_free(pkWhereList);
    return SQLITE_ERROR;
  }

  for (int i = 0; i < allWinningCidsLen; ++i)
  {
    int cid = allWinningCids[i];
    int valIdx = allReceivedCidsToIdx[cid];
    if (valIdx < 0 || valIdx >= numReceivedCids)
    {
      sqlite3_free(allReceivedCidsToIdx);
      sqlite3_free(allWinningCids);
      return SQLITE_ERROR;
    }
    allWinningVals[i] = allReceivedNonPkVals[valIdx];
    columnInfosForInsert[i] = tblInfo->baseCols[cid];
  }

  char *pkIdentifierList = crsql_asIdentifierList(tblInfo->pks, tblInfo->pksLen, 0);
  int len = 0;

  char *conflictSets = crsql_changesTabConflictSets(
      allWinningVals,
      columnInfosForInsert,
      allWinningCidsLen);

  zSql = sqlite3_mprintf(
      "INSERT INTO \"%s\" (%s, %z)\
      VALUES (%z, %z)\
      ON CONFLICT (%z) DO UPDATE\
      %z",
      tblInfo->tblName,
      pkIdentifierList,
      crsql_asIdentifierList(columnInfosForInsert, allWinningCidsLen, 0),
      pkValsStr,
      crsql_quotedValuesAsList(allWinningVals, allWinningCidsLen),
      pkIdentifierList,
      conflictSets);

  for (int i = 0; i < numReceivedCids; ++i)
  {
    sqlite3_free(allReceivedNonPkVals[i]);
  }
  sqlite3_free(allReceivedNonPkVals);

  rc = sqlite3_exec(db, SET_SYNC_BIT, 0, 0, errmsg);
  if (rc != SQLITE_OK)
  {
    sqlite3_free(allReceivedCidsToIdx);
    sqlite3_free(allWinningCids);
    sqlite3_free(pkWhereList);
    sqlite3_exec(db, CLEAR_SYNC_BIT, 0, 0, 0);
    return rc;
  }

  rc = sqlite3_exec(db, zSql, 0, 0, errmsg);
  sqlite3_free(zSql);
  sqlite3_exec(db, CLEAR_SYNC_BIT, 0, 0, 0);

  if (rc != SQLITE_OK)
  {
    sqlite3_free(allReceivedCidsToIdx);
    sqlite3_free(allWinningCids);
    sqlite3_free(pkWhereList);
    return rc;
  }

  sqlite3_free(allReceivedCidsToIdx);
  sqlite3_free(allWinningCids);
  sqlite3_free(pkWhereList);
  // update clocks to new vals now
  // insert into x__crr_clock (table, pk, cid, version) values (...)
  // for each cid & version in allWinningCids

  // TODO: Post merge it is technically possible to have non-unique version vals in the clock table...
  // so deal with that and/or make vtab `without rowid`
  // For the merge:
  // (1) pick their clock and put it for the column
  // (2) push our db version if it is behind their clock so we don't issue
  //     events in the past.

  /*
  - go thru allChangedCids
  - build new colInfoArray from it
  - asIdentifierList that colInfoArray for INSER INTO x (identlist)
    - including pks!
  - create an array of values to insert based on allChangedCids
    - split insertVals
    - go thru allChangedCids
    - look up insertVals index based on allReceivedCids
  - VALUES (pks, valsarr) <-- "as value list" ?
  */

  // sqlite is going to somehow provide us with a rowid.
  // TODO: how in the world does it know the rowid of a vtab?
  // unless it runs a query all against our vtab... which I hope not.

  // implementation must set *pRowid to the rowid of the newly inserted row
  // if argv[1] is an SQL NULL
  // sqlite3_value_type(argv[i])==SQLITE_NULL
  return SQLITE_OK;
}