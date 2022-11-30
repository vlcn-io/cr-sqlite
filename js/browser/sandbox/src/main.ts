import * as nanoid from "nanoid";
import parse, { sql } from "./ql";
import sqliteWasm from "@vlcn.io/wa-crsqlite";

const sqlite = await sqliteWasm();
const db1 = await sqlite.open(":memory:");

await db1.execMany([
  `CREATE TABLE deck (id primary key, name);`,
  `CREATE TABLE slide (id primary key, "order", deck_id);`,
  `CREATE TABLE component (id primary key, text, slide_id);`,
  `CREATE INDEX slide_deck ON slide (deck_id);`,
  `CREATE INDEX comp_slide ON component (slide_id);`,
]);

await db1.execMany([
  `INSERT INTO deck VALUES (1, 'first');`,
  `INSERT INTO slide VALUES (1, 0, 1);`,
  `INSERT INTO slide VALUES (2, 1, 1);`,
  `INSERT INTO component VALUES (1, 'some text', 1);`,
  `INSERT INTO component VALUES (2, 'some other text', 1);`,
  `INSERT INTO component VALUES (3, 'some more text', 1);`,
]);

const r = await db1.execA(sql`
SELECT {
  id: deck.id,
  slides: [SELECT { 
    id: slide.id,
    order: slide."order",
    components: [SELECT {
      id: component.id,
      text: component.text
    } FROM component WHERE component.slide_id = slide.id]
  } FROM slide WHERE slide.deck_id = deck.id],
} FROM deck`);

console.log(r.map((s: any) => JSON.parse(s)));

const id = "1";
const trackArtists = /*sql*/ `(SELECT {
  id: art.id,
  name: art.name
} FROM spotify_arists AS art
  LEFT JOIN spotify_tracks_artists AS ta
  ON ta.artist_id = art.id
  WHERE ta.track_id = t.id)`;

// note:
// we can hoist sub-selects as fragments
// and make them reactive on the component that uses them.
// e.g., like Relay `useFragment` hooks.
const top = sql`
SELECT {
  tracks: [SELECT {
    addedAt: tp.added_at_timestamp,
    trackNumber: tp.track_index,
    track: (SELECT {
      name: t.name,
      durationMs: t.duration_ms,
      trackNumer: t.track_number,
      id: t.id
      album: (SELECT {
        id: a.id,
        name: a.name,
      } FROM spotify_albums AS a WHERE a.id = t.album_id),
      artists: [SELECT {
        id: art.id,
        name: art.name
      } FROM spotify_artists AS art
        LEFT JOIN spotify_tracks_artists AS ta
        ON ta.artist_id = art.id
        WHERE ta.track_id = t.id],
    } FROM spotify_tracks AS t WHERE t.id = tp.track_id)
  } FROM spotify_tracks_playlists as tp WHERE tp.playlist_id = p.id]
} FROM spotify_playlists AS p WHERE p.id = ${id}
`;

// use frag usage:
// sql`

// `

// more ergonimic?
`spotify_playlists: [{
  tracks: [spotify_tracks_playlists {
    addedAt,
    trackNumber,
    track: (spotify_tracks {
      
    })
  }]
}]`;

console.log(top);
