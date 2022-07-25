import { Clock } from "./clock.js";

export type DeltaOptions = {
  // Fetch the first N deltas rather than all deltas.
  // This lets sites incrementally bring themselves up to date
  // rather than all in one shot.
  limit: number;
};

/**
 * A set of functions to construct queries
 * related to the fetching and merging of remote changes.
 */
export default {
  currentClock(table: string): [string, []] {
    return [
      `SELECT siteId, max("version") as version FROM "${clockTableName(
        table
      )}" GROUP BY "siteId"`,
      [],
    ];
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
    opts?: { limit: number }
  ): [string, [string]] {
    return [
      `SELECT "${crrTableName(
        table
      )}".*, json_group_object("siteId", "version") as crr_clock FROM ${clockTableName(
        table
      )} LEFT JOIN json_each(?) as provided_clock ON
    provided_clock."key" = "${clockTableName(table)}"."siteId"
    JOIN "${crrTableName(table)}" ON "${crrTableName(
        table
      )}"."${primaryKeyField}" = ${clockTableName(table)}."id"
    WHERE provided_clock."value" < "${clockTableName(
      table
    )}"."version" OR provided_clock."key" IS NULL GROUP BY "${clockTableName(
        table
      )}"."id"`,
      [JSON.stringify(fromClock)],
    ];
  },

  deltaPrimaryKeys(
    table: string,
    fromClock: Clock,
    opts?: { limit: number }
  ): [string, [string]] {
    return [
      `SELECT "${clockTableName(
        table
      )}"."id", json_group_object("siteId", "version") as crr_clock FROM ${clockTableName(
        table
      )} LEFT JOIN json_each(?) as provided_clock ON
    provided_clock."key" = "${clockTableName(table)}"."siteId"
    WHERE provided_clock."value" < "${clockTableName(
      table
    )}"."version" OR provided_clock."key" IS NULL GROUP BY "${clockTableName(
        table
      )}"."id"`,
      [JSON.stringify(fromClock)],
    ];
  },

  /**
   *
   * @param table table to bring up to date
   * @param deltas delta to patch the table with. Must be in the same format as returned by the `deltas` query.
   */
  patch<
    T extends {
      crr_cl: number;
      crr_clock: string;
    }
  >(table: string, deltas: T[]): [string, any[]] {
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
      [deltas.flatMap((d) => Object.values(d))],
    ];
  },
};

function clockTableName(baseTable: string): string {
  return baseTable + "_crr_clocks";
}

function crrTableName(baseTable: string) {
  return baseTable + "_crr";
}

function patchTableName(baseTable: string) {
  return baseTable + "_patch";
}
