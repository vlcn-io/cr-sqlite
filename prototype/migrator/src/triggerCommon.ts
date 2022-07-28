import { TableInfo } from "./tableInfo";

export const updateVersion =
  'UPDATE "crr_db_version" SET "version" = "version" + 1;';

export const updateClocks = (tableName: string, pks: TableInfo) => {
  return `INSERT INTO "${tableName}_crr_clocks" ("siteId", "version", "id")
  VALUES (
    (SELECT "id" FROM "crr_site_id"),
    (SELECT "version" FROM "crr_db_version"),
    ${pks.map((k) => `NEW."${k.name}"`).join(" || '~!~' || ")}
  )
  ON CONFLICT ("siteId", "id") DO UPDATE SET
    "version" = EXCLUDED."version";`;
};

export function augmentPksIfNone(pks: TableInfo): TableInfo {
  if (pks.length === 0) {
    return [
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

  return pks;
}
