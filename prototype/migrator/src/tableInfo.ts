export type ColumnInfo = {
  cid: number; // column id (order)
  name: string; // column name
  type: string; // data type (if any)
  notnull: number; // 0 no, 1 yes
  dflt_value: any; // default value for the column
  pk: number; // primary key. 0 no, 1 yes
  versionOf?: string;
};
export type TableInfo = ColumnInfo[];

export default {
  pks(tableInfo: TableInfo) {
    return tableInfo.filter((c) => c.pk != 0).sort((l, r) => l.pk - r.pk);
  },

  nonPks(tableInfo: TableInfo) {
    return tableInfo.filter((c) => c.pk === 0);
  },

  baseColumns(tableInfo: TableInfo) {
    return tableInfo.filter((c) => c.versionOf == null);
  },

  withVersionColumns(tableInfo: TableInfo): TableInfo {
    const ret: TableInfo = [];
    for (const c of tableInfo) {
      ret.push(c);
      if (c.pk > 0) {
        continue;
      }

      ret.push({
        cid: -1 * c.cid,
        name: c.name + "_v",
        type: "INTEGER",
        notnull: 0,
        dflt_value: 0,
        pk: 0,
        versionOf: c.name,
      });
    }

    return ret;
  },
};
