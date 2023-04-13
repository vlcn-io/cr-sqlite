import log from "./log.js";

const re = /insert\s|update\s|delete\s/;
const txRe = /begin\s|commit\s|rollback\s|savepoint\s/;

export function computeCacheKey(
  sql: string,
  mode: "o" | "a",
  bind?: SQLiteCompatibleType[]
) {
  const lower = sql.toLowerCase();

  if (txRe.exec(lower) != null) {
    return undefined;
  }

  // is it a write?
  if (re.exec(lower) != null) {
    log("received write");
    return null;
  }

  if (bind != null) {
    const ret =
      lower +
      "|" +
      mode +
      "|" +
      bind.map((b) => (b != null ? b.toString() : "null")).join("|");
    return ret;
  }
  return lower;
}
