const SQLITE_DESERIALIZE_FREEONCLOSE = 1;
const SQLITE_DESERIALIZE_RESIZEABLE = 2;

window.sqlite3InitModule().then(async function (sqlite3) {
  console.log("sqlite3:", sqlite3);
  const db = new sqlite3.oo1.DB();
  await fetch("/overtone.db")
    .then((response) => response.arrayBuffer())
    .then((arrayBuffer) => {
      const bytes = new Uint8Array(arrayBuffer);
      const p = sqlite3.wasm.allocFromTypedArray(bytes);
      const rc = sqlite3.capi.sqlite3_deserialize(
        db.pointer,
        "main",
        p,
        bytes.length,
        bytes.length,
        SQLITE_DESERIALIZE_FREEONCLOSE | SQLITE_DESERIALIZE_RESIZEABLE
      );
      db.checkRc(rc);

      runTests(db);
    });
});

function runTests(db) {
  console.log("time to run the tests!");
  const sql = /*sql*/ `INSERT
  OR REPLACE INTO "view__library_unsorted_tracks" (
      "id",
      "name",
      "isrc",
      "description",
      "externalLink",
      "durationMs",
      "trackNumber",
      "imageUrl",
      "albumId",
      "isLiked",
      "albumName",
      "albumTrackCount",
      "albumColorsString",
      "artistsString"
  )
SELECT
  "_tracks"."id" AS "id",
  "_tracks"."name" AS "name",
  "_tracks"."isrc" AS "isrc",
  "_tracks"."description" AS "description",
  "_tracks".externalLink AS "externalLink",
  "_tracks".durationMs AS "durationMs",
  "_tracks".trackNumber AS "trackNumber",
  "_tracks".imageUrl AS "imageUrl",
  "_tracks".albumId AS "albumId",
  "_tracks".isLiked AS "isLiked",
  "_albums"."name" AS "albumName",
  "_albums"."trackCount" AS "albumTrackCount",
  "_albums"."colorsString" AS "albumColorsString",
  (
      SELECT
          json_group_array(
              DISTINCT json_object('id', "_artists"."id", 'name', "_artists"."name")
          )
      FROM
          library_tracks_artists AS "_tracks_artists"
          JOIN library_artists AS "_artists" ON "_tracks_artists"."artistId" = "_artists"."id"
      WHERE
          "_tracks_artists"."trackId" = "_tracks"."id"
  ) AS "artistsString"
FROM
  library_tracks AS "_tracks"
  LEFT OUTER JOIN library_albums AS "_albums" on "_tracks"."albumId" = "_albums"."id"
WHERE
  "_tracks"."id" = 'spotify:track:2WahR7jVz3jIXQOQg3WyiM'`;

  const stmt = db.prepare(sql);

  for (let i = 0; i < 200; ++i) {
    const t0 = performance.now();
    stmt.step();
    const t1 = performance.now();
    stmt.reset();
    console.log(`Call to took ${t1 - t0} milliseconds.`);
  }
}
