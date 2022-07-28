import { Database as DB } from "better-sqlite3";
import chalk from "chalk";
import { ColumnInfo, TableInfo } from "./tableInfo.js";
import tableInfoFn from "./tableInfo.js";
import createTriggers from "./createTriggers.js";

// https://www.sqlite.org/pragma.html#pragma_index_info
type IndexListEntry = {
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
      src,
      dest,
      w,
      src.pragma(`table_info(${w})`),
      src.pragma(`index_list(${w})`)
    )
  );
}

function createCrrSchemasFor(
  src: DB,
  dest: DB,
  tableName: string,
  tableInfo: TableInfo,
  indexList: IndexListEntry[]
) {
  console.log("\n");
  console.log(chalk.green("Creating LWW table for", chalk.blue(tableName)));

  const pks = tableInfoFn.pks(tableInfo);
  const columnsWithVersionColumns = tableInfoFn.withVersionColumns(tableInfo);
  dest
    .prepare(
      `CREATE TABLE IF NOT EXISTS "${tableName}_crr" (
    ${columnsWithVersionColumns.map(getColumnDefinition).join(",\n")},
    "crr_cl" INTEGER DEFAULT 1,
    "crr_update_src" INTEGER DEFAULT 0${
      pks.length > 0
        ? `,
    PRIMARY KEY (${pks.map((k) => `"${k.name}"`).join(",")})`
        : ""
    }
  )`
    )
    .run();

  console.log(`\tCreating indices`);
  indexList.forEach((index) => {
    // We create primary keys in the table creation statement.
    if (index.origin === "pk") {
      return;
    }

    const indexInfo = src.pragma(`index_info("${index.name}")`);
    if (index.unique === 1 && index.origin != "pk") {
      console.log(
        chalk.yellow(
          "\tWARNING: unique indices that are not primary keys are dropped and treated as non-unique indices."
        )
      );
      console.log(
        chalk.yellow(
          `Converting ${tableName}.${index.name} to a non-unique index`
        )
      );
    }

    console.log(`\tcreating index ${index.name} on ${tableName}_crr`);
    dest
      .prepare(
        `CREATE INDEX IF NOT EXISTS "${
          index.name
        }" ON "${tableName}_crr" (${indexInfo
          .map((i) => '"' + i.name + '"')
          .join(",")})`
      )
      .run();
  });

  console.log(chalk.green("Creating Clock table for", chalk.blue(tableName)));
  dest
    .prepare(
      `CREATE TABLE IF NOT EXISTS "${tableName}_crr_clocks" (
    "id" integer NOT NULL,
    "siteId" integer NOT NULL,
    "version" integer NOT NULL,
    PRIMARY KEY ("siteId", "id")
  )`
    )
    .run();

  console.log(chalk.green("Creating view for", chalk.blue(tableName)));
  dest
    .prepare(
      `CREATE VIEW IF NOT EXISTS "${tableName}" AS SELECT ${tableInfo
        .map((t) => `"${t.name}"`)
        .join(",\n")}
      FROM
        "${tableName}_crr"
      WHERE
        "${tableName}_crr"."crr_cl" % 2 = 1`
    )
    .run();

  console.log(chalk.green("Creating patch view for", chalk.blue(tableName)));
  dest.prepare(
    `CREATE VIEW
      IF NOT EXISTS "${tableName}_patch" AS SELECT
        "${tableName}_crr".*,
        '{"fake": 1}' as crr_clock
      FROM "${tableName}_crr"`
  );

  console.log(chalk.green("Creating triggers for", chalk.blue(tableName)));
  createTriggers(dest, tableName, columnsWithVersionColumns);
}

function getColumnDefinition(columnInfo: ColumnInfo): string {
  return `"${columnInfo.name}" ${columnInfo.type}${
    columnInfo.notnull === 1 ? " NOT NULL" : ""
  }${
    columnInfo.dflt_value !== null ? ` DEFAULT '${columnInfo.dflt_value}'` : ""
  }`;
}
