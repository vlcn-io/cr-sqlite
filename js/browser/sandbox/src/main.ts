import * as nanoid from "nanoid";
import parse from "./ql";
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

function sql(strings, ...values) {
  const interoplated = String.raw({ raw: strings }, ...values);
  return parse(interoplated);
}

const r = await db1.execA(sql`
SELECT {
  id: deck.id,
  slides: (SELECT { 
    id: slide.id,
    order: slide."order",
    components: (SELECT {
      id: component.id,
      text: component.text
    } FROM component WHERE component.slide_id = slide.id)
  } FROM slide WHERE slide.deck_id = deck.id),
} FROM deck`);

console.log(r.map((s: any) => JSON.parse(s)));
