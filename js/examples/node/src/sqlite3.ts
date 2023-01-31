// @ts-ignore
import sqlite3 from "sqlite3";
import { extensionPath } from "@vlcn.io/crsqlite";

const db = new sqlite3.Database(":memory:");
db.loadExtension(extensionPath, (e: any) => {
  db.get("select crsql_dbversion()", (err: any, row: any) => {
    console.log(row);
  });

  // Must run `finalize` prior to closing the DB
  db.run("select crsql_finalize()");
  db.close();
});
