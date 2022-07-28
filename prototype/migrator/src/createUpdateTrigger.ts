import { Database as DB } from "better-sqlite3";
import tableInfoFn, { TableInfo } from "./tableInfo.js";
import {
  augmentPksIfNone,
  updateClocks,
  updateVersion,
} from "./triggerCommon.js";

export default function createUpdateTrigger(
  db: DB,
  tableName: string,
  columns: TableInfo
) {
  let pks = augmentPksIfNone(tableInfoFn.pks(columns));

  const sets = conflictSets(columns);
  db.prepare(
    `
CREATE TRIGGER IF NOT EXISTS "${tableName}_update_trig"
  INSTEAD OF UPDATE ON "${tableName}"
BEGIN
  ${updateVersion}

  UPDATE "${tableName}_crr" SET
    ${sets}${sets != "" ? "," : ""}
    "crr_update_src" = 0
  WHERE ${pks.map((k) => `"${k.name}" = NEW."${k.name}"`).join(" AND ")};

  ${updateClocks(tableName, pks)}
END;
`
  ).run();
}

function conflictSets(columns: TableInfo): string {
  const notPks = tableInfoFn.nonPks(columns);
  return notPks
    .map((c) => {
      if (c.versionOf != null) {
        return `"${c.name}" = CASE WHEN OLD."${c.versionOf}" != NEW."${c.versionOf}" THEN "${c.name}" + 1 ELSE "${c.name}" END`;
      }

      return `"${c.name}" = NEW."${c.name}"`;
    })
    .join(",\n");
}
