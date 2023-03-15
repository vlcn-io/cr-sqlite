// this script exists to allow us to run `lldb` against arbitrary code
// loaded into node.
// clobber below with whatever you need to debug today.

import crsqlite from "@vlcn.io/crsqlite-allinone";

const db = crsqlite.open();
db.exec(`CREATE TABLE IF NOT EXISTS data (id NUMBER PRIMARY KEY)`);
db.exec(`SELECT crsql_as_crr('data')`);
db.exec(`INSERT INTO data VALUES (42) ON CONFLICT DO NOTHING`);
console.log(db.prepare(`SELECT * FROM data`).all());
console.log(db.prepare(`SELECT * FROM crsql_changes`).all());
