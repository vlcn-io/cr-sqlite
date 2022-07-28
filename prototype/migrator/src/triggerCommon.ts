import { TableInfo } from "./tableInfo";

export const updateVersion =
  'UPDATE "crr_db_version" SET "version" = "version" + 1;';

export const updateClocks = (tableName: string, pks: TableInfo) => {
  return `INSERT INTO "${tableName}_crr_clocks" (
    "siteId",
    "version",
    ${pks.map((k) => `"${k.name}"`).join(",\n")})
  VALUES (
    (SELECT "id" FROM "crr_site_id"),
    (SELECT "version" FROM "crr_db_version"),
    ${pks.map((k) => `NEW."${k.name}"`).join(",\n")}
  )
  ON CONFLICT ("siteId", "id") DO UPDATE SET
    "version" = EXCLUDED."version";`;
};

export function augmentPksIfNone(pks: TableInfo): TableInfo {
  if (pks.length === 0) {
    return [
      {
        cid: 0n,
        name: "rowid",
        type: "integer",
        notnull: 1n,
        dflt_value: 1,
        pk: 1n,
      },
    ];
  }

  return pks;
}
