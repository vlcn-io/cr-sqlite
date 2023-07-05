#include <assert.h>
#include <stdio.h>
#include <time.h>

#include "crsqlite.h"
#include "rust.h"

int crsql_close(sqlite3 *db);
int syncLeftToRight(sqlite3 *db1, sqlite3 *db2, sqlite3_int64 since);

static void testSandbox() {
  printf("Sandbox\n");
  sqlite3 *db;
  int rc;
  rc = sqlite3_open("./overtone-repro.db", &db);
  sqlite3_stmt *pStmt;
  rc += sqlite3_prepare_v2(
      db,
      "INSERT OR REPLACE INTO \"view__library_unsorted_tracks\" (\"id\", "
      "\"name\", \"isrc\", \"description\", \"externalLink\", \"durationMs\", "
      "\"trackNumber\", \"imageUrl\", \"albumId\", \"isLiked\", \"albumName\", "
      "\"albumTrackCount\", \"albumColorsString\", \"artistsString\") SELECT "
      "\"_tracks\".\"id\" AS \"id\", \"_tracks\".\"name\" AS \"name\", "
      "\"_tracks\".\"isrc\" AS \"isrc\", \"_tracks\".\"description\" AS "
      "\"description\", \"_tracks\".externalLink AS \"externalLink\", "
      "\"_tracks\".durationMs AS \"durationMs\", \"_tracks\".trackNumber AS "
      "\"trackNumber\", \"_tracks\".imageUrl AS \"imageUrl\", "
      "\"_tracks\".albumId AS \"albumId\", \"_tracks\".isLiked AS \"isLiked\", "
      "\"_albums\".\"name\" AS \"albumName\", \"_albums\".\"trackCount\" AS "
      "\"albumTrackCount\", \"_albums\".\"colorsString\" AS "
      "\"albumColorsString\", (SELECT json_group_array(DISTINCT "
      "json_object('id', \"_artists\".\"id\", 'name', \"_artists\".\"name\") ) "
      "FROM library_tracks_artists AS \"_tracks_artists\" JOIN library_artists "
      "AS \"_artists\" ON \"_tracks_artists\".\"artistId\" = "
      "\"_artists\".\"id\" WHERE \"_tracks_artists\".\"trackId\" = "
      "\"_tracks\".\"id\" ) AS \"artistsString\" FROM library_tracks AS "
      "\"_tracks\" LEFT OUTER JOIN library_albums AS \"_albums\" on "
      "\"_tracks\".\"albumId\" = \"_albums\".\"id\" WHERE \"_tracks\".\"id\" = "
      "'spotify:track:2WahR7jVz3jIXQOQg3WyiM'",
      -1, &pStmt, 0);
  assert(rc == SQLITE_OK);

  for (int i = 0; i < 200; ++i) {
    clock_t tic = clock();
    rc = sqlite3_step(pStmt);
    clock_t toc = clock();
    assert(rc == SQLITE_DONE);
    sqlite3_reset(pStmt);
    printf("Elapsed: %f microseconds\n",
           ((double)(toc - tic) / CLOCKS_PER_SEC) * 1000000);
  }

  sqlite3_finalize(pStmt);
  rc = crsql_close(db);
  assert(rc == SQLITE_OK);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

void crsqlSandboxSuite() {
  testSandbox();
  printf("\e[47m\e[1;30mSuite: sandbox\e[0m\n");
}
