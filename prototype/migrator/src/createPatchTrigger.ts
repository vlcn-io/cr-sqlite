import { Database as DB } from "better-sqlite3";
import tableInfoFn, { TableInfo } from "./tableInfo.js";
import { augmentPksIfNone } from "./triggerCommon.js";

export default function createPatchTrigger(
  db: DB,
  tableName: string,
  columns: TableInfo
) {
  const pks = augmentPksIfNone(tableInfoFn.pks(columns));
  const nonPks = tableInfoFn.nonPks(columns);
  const sets = conflictSets(nonPks);
  const q = `
  CREATE TRIGGER IF NOT EXISTS "${tableName}_patch_trig"
    INSTEAD OF INSERT ON "${tableName}_patch"
  BEGIN
  
    INSERT INTO "${tableName}_crr" (
      ${columns.map((c) => `"${c.name}"`).join(",\n")},
      "crr_cl",
      "crr_update_src"
    ) VALUES (
      ${columns.map((c) => `NEW."${c.name}"`).join(",\n")},
      NEW."crr_cl",
      1
    ) ON CONFLICT (${pks.map((k) => `"${k.name}"`).join(", ")}) DO UPDATE SET
      ${sets}${sets != "" ? "," : ""}
      "crr_update_src" = 1;
  
    INSERT INTO "${tableName}_crr_clocks" (
      "siteId",
      "version",
      ${pks.map((k) => `"${k.name}"`).join(",\n")}
    ) SELECT "key" as "siteId", "value" as "version", ${pks
      .map((k) => `NEW."${k.name}"`)
      .join(", ")} FROM json_each(NEW.crr_clock) WHERE true
    ON CONFLICT ("siteId", ${pks
      .map((k) => `"${k.name}"`)
      .join(", ")}) DO UPDATE SET
      "version" = CASE WHEN EXCLUDED."version" > "version" THEN EXCLUDED."version" ELSE "version" END;
  END;
      `;
  console.log(q);
  db.prepare(q).run();
}

// TODO: have type system enforce pks are not here
function conflictSets(notPks: TableInfo): string {
  return notPks
    .map((c) => {
      // version col
      if (c.versionOf != null) {
        return `"${c.name}" = CASE
          WHEN EXCLUDED."${c.name}" > "${c.name}" THEN EXCLUDED."${c.name}"
          ELSE "${c.name}"
        END`;
      }

      // regular col
      return `"${c.name}" = CASE
        WHEN EXCLUDED."${c.name}_v" > "${c.name}_v" THEN EXCLUDED."${c.name}"
        WHEN EXCLUDED."${c.name}_v" = "${c.name}_v" THEN
          CASE
            WHEN "${c.name}" IS NULL THEN EXCLUDED."${c.name}"
            WHEN EXCLUDED."${c.name}" > "${c.name}" THEN EXCLUDED."${c.name}"
            ELSE "${c.name}"
          END
        ELSE "${c.name}"
      END`;
    })
    .join(",\n");
}
