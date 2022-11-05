// @ts-ignore
import sqlite3 from 'sqlite3';
import {resolve} from 'import-meta-resolve';
const modulePath = new URL(
  await resolve('@vlcn.io/crsqlite', import.meta.url)
).pathname;

const db = new sqlite3.Database(':memory:');
db.loadExtension(modulePath, (e: any) => {
  console.log(e);
  db.get("select crsql_dbversion()", (err: any, row: any) => {
    console.log(row);
  });
})
