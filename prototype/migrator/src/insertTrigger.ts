import { Database as DB } from "better-sqlite3";
import chalk from "chalk";
import tableInfoFn, { TableInfo } from "./tableInfo.js";

export default function createInsertTrigger(
  db: DB,
  tableName: string,
  columns: TableInfo
) {
  let pks = tableInfoFn.pks(columns);
  if (pks.length === 0) {
    // TODO: provide a similar warning for auto-increment primary keys
    console.log(
      chalk.yellow(
        `WARN: ${tableName} had no primary key defined. Defaulting to using rowid. This means when databases are merged, rows with the same auto-increment id will be considered to be the same row and merged together. This is probably not what you want.`
      )
    );
    pks = [
      {
        cid: 0,
        name: "rowid",
        type: "integer",
        notnull: 1,
        dflt_value: 1,
        pk: 1,
      },
    ];
  }

  const baseColumns = tableInfoFn.baseColumns(columns);
  const q = `
CREATE TRIGGER IF NOT EXISTS "${tableName}_insert_trig"
  INSTEAD OF INSERT ON "${tableName}"
BEGIN
  UPDATE "crr_db_version" SET "version" = "version" + 1;

  INSERT INTO "${tableName}_crr" (
    ${baseColumns.map((c) => '"' + c.name + '"').join(",\n")}
  ) VALUES (${baseColumns
    .map((c) => `NEW."${c.name}"`)
    .join(",\n")}) ${conflictResolution(tableName, columns)};

  INSERT INTO "${tableName}_crr_clocks" ("siteId", "version", "id")
    VALUES (
      (SELECT "id" FROM "crr_site_id"),
      (SELECT "version" FROM "crr_db_version"),
      ${pks.map((k) => `NEW."${k.name}"`).join(" || '~!~' || ")}
    )
    ON CONFLICT ("siteId", "id") DO UPDATE SET
      "version" = EXCLUDED."version";
END;
`;
  db.prepare(q).run();
}

function conflictResolution(tableName: string, columns: TableInfo): string {
  const pks = tableInfoFn.pks(columns);
  if (pks.length === 0) {
    return "";
  }

  // an insert conflict is an un-delete, thus ++ cl.
  const sets = conflictSets(columns);
  return `ON CONFLICT (${pks.map((k) => `"${k.name}"`).join(",")}) DO UPDATE SET
    ${sets}${sets != "" ? "," : ""}
    "crr_cl" = CASE WHEN "crr_cl" % 2 = 0 THEN "crr_cl" + 1 ELSE "crr_cl" END,
    "crr_update_src" = 0`;
}

function conflictSets(columns: TableInfo): string {
  const notPks = tableInfoFn.nonPks(columns);
  return notPks
    .map((c) => {
      if (c.versionOf != null) {
        return `"${c.name}" = CASE WHEN EXCLUDED."${c.versionOf}" != "${c.versionOf}" THEN "${c.name}" + 1 ELSE "${c.name}" END`;
      }

      return `"${c.name}" = EXCLUDED."${c.name}"`;
    })
    .join(",\n");
}
