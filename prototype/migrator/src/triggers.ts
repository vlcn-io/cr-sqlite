import { Database as DB } from "better-sqlite3";
import tableInfoFn, { TableInfo } from "./tableInfo.js";

export default function createTriggers(
  db: DB,
  tableName: string,
  columns: TableInfo
) {
  console.log("\tcreating insert trigger");
  createInsertTrigger(db, tableName, columns);

  console.log("\tcreating update trigger");
}

function createInsertTrigger(db: DB, tableName: string, columns: TableInfo) {
  const pks = tableInfoFn.pks(columns);
  if (pks.length === 0) {
    throw {
      type: "invariant",
      message: `All tables must have a primary key to become conflict free. ${tableName} has no primary key.`,
    };
  }
  db.prepare(
    `CREATE TRIGGER IF NOT EXISTS "${tableName}_insert_trig"
    INSTEAD OF INSERT ON "${tableName}"
  BEGIN
    UPDATE "crr_db_version" SET "version" = "version" + 1;

    INSERT INTO "${tableName}_crr" (
      ${columns.map((c) => '"' + c.name + '"').join(",\n")}
    ) VALUES () ${conflictResolution(tableName, columns)};

    INSERT INTO "${tableName}_crr_clocks" ("siteId", "version", "id")
      VALUES (
        (SELECT "id" FROM "crr_site_id"),
        (SELECT "version" FROM "crr_db_version"),
        ${pks.map((k) => `NEW."${k.name}"`).join(" || ")}
      )
      ON CONFLICT ("siteId", "id") DO UPDATE SET
        "version" = EXCLUDED."version";
  END;
  `
  ).run();
}

function conflictResolution(tableName: string, columns: TableInfo): string {
  const pks = tableInfoFn.pks(columns);
  if (pks.length === 0) {
    return "";
  }

  return `ON CONFLICT (${pks.map((k) => `"${k.name}"`).join(",")}) DO UPDATE SET
    ${conflictSets(columns)}`;
}

function conflictSets(columns: TableInfo): string {
  const notPks = tableInfoFn.nonPks(columns);
  return notPks
    .map((c) => {
      if (c.versionOf != null) {
        return `"${c.name}" = CASE WHEN EXCLUDED."${c.versionOf}" != "${c.versionOf}" THEN "${c.name}" + 1 ELSE "${c.name}" END`;
      }

      return `"${c.versionOf}" = EXCLUDED."${c.versionOf}"`;
    })
    .join(",\n");
}

function createUpdateTrigger() {}
function createDeleteTrigger() {}
function createPatchTrigger() {}
