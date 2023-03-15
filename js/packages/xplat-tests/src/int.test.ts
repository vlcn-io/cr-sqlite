import { DBAsync, DB as DBSync } from "@vlcn.io/xplat-api";
type DB = DBAsync | DBSync;

function createSimpleSchema(db: DB) {
  return db.execMany([
    "CREATE TABLE i64col (a primary key, b INTEGER);",
    "CREATE TABLE anycol (a primary key, b);"
  ]);
}

export const tests = {
  "read and write a num < max int": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    await createSimpleSchema(db);

    await db.exec('INSERT INTO anycol VALUES (1, ?)', [BigInt(1)]);
    let r = await db.execA('SELECT b FROM anycol');
    assert(r[0][0] == 1);

    await db.exec('INSERT INTO i64col VALUES (1, ?)', [BigInt(1)]);
    r = await db.execA('SELECT b FROM i64col');
    assert(r[0][0] == 1);
  },

  "read and write a number that is > max int": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    await createSimpleSchema(db);

    await db.exec('INSERT INTO anycol VALUES (1, ?)', [
      BigInt(Number.MAX_SAFE_INTEGER) + BigInt(Number.MAX_SAFE_INTEGER)
    ]);
    let r = await db.execA('SELECT b FROM anycol');
    assert(r[0][0] == BigInt(Number.MAX_SAFE_INTEGER) + BigInt(Number.MAX_SAFE_INTEGER));

    await db.exec('INSERT INTO i64col VALUES (1, ?)', [
      BigInt(Number.MAX_SAFE_INTEGER) + BigInt(Number.MAX_SAFE_INTEGER)
    ]);
    r = await db.execA('SELECT b FROM i64col');
    assert(r[0][0] == BigInt(Number.MAX_SAFE_INTEGER) + BigInt(Number.MAX_SAFE_INTEGER));
  },
};