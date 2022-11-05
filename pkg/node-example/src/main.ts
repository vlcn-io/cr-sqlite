import {resolve} from 'import-meta-resolve';
// @ts-ignore
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
const modulePath = await resolve('@vlcn.io/crsqlite', import.meta.url);

const dbA = new Database(":memory:");
const dbB = new Database(":memory:");

dbA.loadExtension(new URL(modulePath).pathname);
dbB.loadExtension(new URL(modulePath).pathname);

const dbs = [dbA, dbB] as const;

// Util to interact with both dbs at once.
function both<T>(op: (db: any) => T): [T, T] {
  return dbs.map(x => op(x)) as [T, T];
}

// Put both dbs into the same initial state
both(x => x.prepare("CREATE TABLE foo (a primary key, b)").run());
both(x => x.prepare("SELECT crsql_as_crr('foo')").run());
both(x => seed(x))

// get current version
// const [va, vb] = both(x => x.prepare("SELECT crsql_dbversion()").get());
// console.log(va, vb);

function makeStr(length: number) {
  var result           = '';
  var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

function seed(db: any) {
  const insert = db.prepare("INSERT INTO foo (a, b) VALUES (@a, @b)");
  const fn = db.transaction((items: any) => {
    for (const item of items) insert.run(item);
  });

  Array.from({length: 200}).map(x => {
    return {
      a: randomUUID(),
      b: makeStr((Math.random() * 24) | 0),
    };
  })
}