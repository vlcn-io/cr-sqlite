import { DBAsync } from "@vlcn.io/xplat-api";
type DB = DBAsync;

export const tests = {
  "can automigrate an empty db": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    try {
      db.tx(async (tx) => {
        await tx.exec(`SELECT crsql_automigrate(?)`, [
          `CREATE TABLE IF NOT EXISTS test (id PRIMARY KEY, name TEXT);
  SELECT crsql_as_crr('test');
        `,
        ]);
      });
    } catch (e) {
      assert(false);
    }
  },
};
