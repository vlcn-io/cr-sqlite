import { Database as DB } from "better-sqlite3";
import setupDb from "./setupDb";

let dbA: DB;
let dbB: DB;
let dbC: DB;

beforeAll(() => {
  [dbA, dbB, dbC] = [setupDb(), setupDb(), setupDb()];
});

test("", () => {});
