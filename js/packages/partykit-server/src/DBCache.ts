import DB from "./DB";

/**
 * Caches connections to active databases so we do not need to re-create the connection
 * on each request.
 *
 * Connection re-creation can be expensive due to the work required to setup sqlite + load extensions.
 */
export default class DBCache {
  readonly #dbs = new Map<string, [number, DB]>();

  getAndRef(roomId: string, schemaName: string, schemaVersion: bigint) {
    let entry = this.#dbs.get(roomId);
    if (entry == null) {
      entry = [1, new DB(roomId)];
    } else {
      const db = entry[1];
      if (db.schemasMatch(schemaName, schemaVersion)) {
        entry[0] += 1;
      } else {
        throw new Error(
          `Requested a schema name and version that the server does not have.`
        );
      }
    }
    return entry[1];
  }

  unref(roomId: string) {
    const entry = this.#dbs.get(roomId);
    if (entry == null) {
      throw new Error(
        `illegal state -- cannot find db cache entry for ${roomId}`
      );
    }

    entry[0] -= 1;
    if (entry[0] === 0) {
      entry[1].close();
      this.#dbs.delete(roomId);
    } else if (entry[0] < 0) {
      throw new Error(`illegal state -- ref count less than 0 for ${roomId}`);
    }
  }
}
