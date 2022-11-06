import Database from "better-sqlite3";
import { resolve } from "import-meta-resolve";
const modulePath = new URL(await resolve("@vlcn.io/crsqlite", import.meta.url))
  .pathname;

const api = {
  open(filename?: string, mode: string = "c"): DB {
    return new DB(filename || ":memory:");
  },
};

export class DB {
  db: Database;
  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.loadExtension(modulePath);
  }

  exec() {}

  execO() {}

  execA() {}

  isOpen() {}

  dbFilename() {}

  openStatementCount() {}

  prepare() {}

  createFunction() {}

  savepoint(bc: () => void) {}

  transaction(cb: () => void) {
    // TODO: do as manual...
    const cb2 = this.db.transaction(cb);
    cb2();
  }

  close() {
    this.db.prepare("select crsql_finalize();").run();
    this.db.close();
  }
}

export default api;
