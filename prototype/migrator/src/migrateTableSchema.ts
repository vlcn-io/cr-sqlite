import { Database as DB } from "better-sqlite3";
import chalk from "chalk";

type TableInfo = {
  cid: number; // column id (order)
  name: string; // column name
  type: string; // data type (if any)
  notnull: number; // 0 no, 1 yes
  dflt_value: any; // default value for the column
  pk: number; // primary key. 0 no, 1 yes
};

export default function migrateTableSchemas(
  src: DB,
  dest: DB,
  which: string[]
) {
  which.forEach((w) =>
    createCrrSchemasFor(dest, w, src.pragma(`table_info(${w})`))
  );
}

function createCrrSchemasFor(db: DB, tableName: string, tableInfo) {
  console.log("\n");
  console.log(chalk.green("Creating LWW table for", chalk.blue(tableName)));

  console.log(chalk.green("Creating Clock table for", chalk.blue(tableName)));

  console.log(chalk.green("Creating view for", chalk.blue(tableName)));

  console.log(chalk.green("Creating patch view for", chalk.blue(tableName)));

  console.log(chalk.green("Creating triggers for", chalk.blue(tableName)));
}
