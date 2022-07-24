export type DeltaOptions = {
  // Fetch the first N deltas rather than all deltas.
  // This lets sites incrementally bring themselves up to date
  // rather than all in one shot.
  limit: number;
};

type SiteId = string;
type Version = string;
type Clock = { [key: SiteId]: Version };

/**
 * A set of functions to construct queries
 * related to the fetching and merging of remote changes.
 */
export default {
  currentClock(table: string): string {
    return `SELECT siteId, max("version") as version FROM "${clockTableName(
      table
    )}" GROUP BY "siteId"`;
  },

  clockAt(
    table: string,
    primaryKey: string | number
  ): [string, [string | number]] {
    return [
      `SELECT siteId, version FROM "${clockTableName(
        table
      )}" WHERE "primaryKey" = ?`,
      [primaryKey],
    ];
  },

  /**
   * Returns a query that can be used to fetch all deltas
   * from a peer since the provided clock.
   * @param table table from which to get changes
   * @param fromClock clock after which we need changes
   * @param opts see type DeltaOptions
   */
  deltas(
    table: string,
    primaryKeyField: string,
    fromClock: Clock,
    opts: { limit: number }
  ) {
    return `SELECT "${clockTableName(
      table
    )}"."primaryKey" as primaryKey, json_group_object("siteId", "version") as clock FROM ${clockTableName(
      table
    )} LEFT JOIN json_each(${JSON.stringify(fromClock)}) as provided_clock ON
    provided_clock."key" = "${clockTableName(table)}"."siteId"
    JOIN "${crrTableName(table)}" ON "${crrTableName(
      table
    )}"."${primaryKeyField}" = ${clockTableName(table)}."primaryKey"
    WHERE provided_clock."value" < "${clockTableName(
      table
    )}"."version" OR provided_clock."key" IS NULL
    GROUP BY "${clockTableName(table)}"."primaryKey"`;
  },

  deltaPrimaryKeys(table: string, fromClock: Clock, opts: { limit: number }) {
    return `SELECT "${clockTableName(
      table
    )}"."primaryKey" as primaryKey, json_group_object("siteId", "version") as clock FROM ${clockTableName(
      table
    )} LEFT JOIN json_each(${JSON.stringify(fromClock)}) as provided_clock ON
    provided_clock."key" = "${clockTableName(table)}"."siteId"
    WHERE provided_clock."value" < "${clockTableName(
      table
    )}"."version" OR provided_clock."key" IS NULL
    GROUP BY "${clockTableName(table)}"."primaryKey"`;
  },

  /**
   *
   * @param table table to bring up to date
   * @param deltas delta to patch the table with. Must be in the same format as returned by the `deltas` query.
   */
  patch<
    T extends {
      crr_cl: number;
      vector_clock: string;
    }
  >(table: string, deltas: T[]): [string, T[]] {
    if (deltas.length === 0) {
      throw new Error("Delta length is 0, nothing to patch");
    }
    const columnNames = Object.keys(deltas[0]).map((k) => '"' + k + '"');
    const valueSlots = deltas.map(
      (d) => "(" + columnNames.map((c) => "?").join(",") + ")"
    );
    return [
      `INSERT INTO "${patchTableName(table)}" (${columnNames.join(
        ","
      )}) VALUES ${valueSlots.join(",")}`,
      deltas,
    ];
  },
};

function clockTableName(baseTable: string): string {
  return baseTable + "_vector_clocks";
}

function crrTableName(table: string) {
  return table + "_crr";
}

function patchTableName(table: string) {
  return table + "_patch";
}
