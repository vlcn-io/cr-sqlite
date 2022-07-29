import { Database as DB } from "better-sqlite3";
import tableInfoFn, { TableInfo } from "./tableInfo.js";
import {
  augmentPksIfNone,
  updateClocks,
  updateVersion,
} from "./triggerCommon.js";

export default function createDeleteTrigger(
  db: DB,
  tableName: string,
  columns: TableInfo
) {
  let pks = augmentPksIfNone(tableInfoFn.pks(columns));

  db.prepare(
    `
CREATE TRIGGER IF NOT EXISTS "${tableName}_delete_trig"
  INSTEAD OF DELETE ON "${tableName}"
BEGIN
  ${updateVersion}

  UPDATE "${tableName}_crr" SET "crr_cl" = "crr_cl" + 1, "crr_update_src" = 0 WHERE ${pks
      .map((pk) => `"${pk.name}" = OLD."${pk.name}"`)
      .join(" AND ")};

  ${updateClocks(tableName, pks)}
END;
  `
  ).run();
}
