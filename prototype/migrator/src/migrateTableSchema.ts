import { Database as DB } from "better-sqlite3";
import chalk from "chalk";

type ColumnInfo = {
  cid: number; // column id (order)
  name: string; // column name
  type: string; // data type (if any)
  notnull: number; // 0 no, 1 yes
  dflt_value: any; // default value for the column
  pk: number; // primary key. 0 no, 1 yes
};
type TableInfo = ColumnInfo[];

// https://www.sqlite.org/pragma.html#pragma_index_info
type IndexInfo = {
  seq: number;
  name: string;
  unique: number;
  origin: string; // c, pk, u
  partial: number; // https://www.sqlite.org/partialindex.html
};

export default function migrateTableSchemas(
  src: DB,
  dest: DB,
  which: string[]
) {
  which.forEach((w) =>
    createCrrSchemasFor(
      dest,
      w,
      src.pragma(`table_info(${w})`),
      src.pragma(`index_list(${w})`)
    )
  );
}

function createCrrSchemasFor(
  db: DB,
  tableName: string,
  tableInfo: TableInfo,
  indexList
) {
  console.log("\n");
  console.log(chalk.green("Creating LWW table for", chalk.blue(tableName)));

  db.prepare(`CREATE TABLE IF NOT EXISTS ${tableName}_crr (
    ${tableInfo.map(getColumnDefinition).join(",\n")}
  )`);

  console.log(`\tCreating indices`);

  // TODO: some indices may need to be dropped. warn on that.

  console.log(chalk.green("Creating Clock table for", chalk.blue(tableName)));

  console.log(chalk.green("Creating view for", chalk.blue(tableName)));

  console.log(chalk.green("Creating patch view for", chalk.blue(tableName)));

  console.log(chalk.green("Creating triggers for", chalk.blue(tableName)));
}

function getColumnDefinition(columnInfo: ColumnInfo) {
  return `"${columnInfo.name}" ${columnInfo.type}${
    columnInfo.notnull === 1 ? " NOT NULL" : ""
  }${
    columnInfo.dflt_value !== null ? ` DEFAULT ${columnInfo.dflt_value}` : ""
  }${columnInfo.pk === 1 ? " PRIMARY KEY" : ""}`;
}
