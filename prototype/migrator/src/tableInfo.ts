// Ideally these are `number` not `bigint` but better-sqlite3 makes everything
// a bigint when bigint safe mode is on (which it needs to be because dbs will have 64bit ints in them)
export type ColumnInfo = {
  cid: BigInt; // column id (order)
  name: string; // column name
  type: string; // data type (if any)
  notnull: BigInt; // 0 no, 1 yes
  dflt_value: any; // default value for the column
  pk: BigInt; // primary key. 0 no, 1 yes
  versionOf?: string;
};
export type TableInfo = ColumnInfo[];

export default {
  pks(tableInfo: TableInfo) {
    return tableInfo
      .filter((c) => c.pk != 0n)
      .sort((l, r) => (l.pk > r.pk ? 1 : l.pk < r.pk ? -1 : 0));
  },

  nonPks(tableInfo: TableInfo) {
    return tableInfo.filter((c) => c.pk === 0n);
  },

  baseColumns(tableInfo: TableInfo) {
    return tableInfo.filter((c) => c.versionOf == null);
  },

  withVersionColumns(tableInfo: TableInfo): TableInfo {
    const ret: TableInfo = [];
    for (const c of tableInfo) {
      ret.push(c);
      if (c.pk > 0n) {
        continue;
      }

      ret.push({
        cid: -1n,
        name: c.name + "_v",
        type: "INTEGER",
        notnull: 0n,
        dflt_value: 0,
        pk: 0n,
        versionOf: c.name,
      });
    }

    return ret;
  },
};
