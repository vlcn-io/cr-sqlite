import DB from "./DB.js";
import { Config } from "./config.js";
import logger from "./logger.js";

/**
 * Caches connections to active databases so we do not need to re-create the connection
 * on each request.
 *
 * Connection re-creation can be expensive due to the work required to setup sqlite + load extensions.
 */
export default class DBCache {
  readonly #dbs = new Map<string, [number, DB]>();
  readonly #config;

  constructor(config: Config) {
    this.#config = config;
  }

  getAndRef(roomId: string, schemaName: string, schemaVersion: bigint) {
    logger.info(`Get db from cache for room "${roomId}"`);
    let entry = this.#dbs.get(roomId);
    if (entry == null) {
      entry = [1, new DB(this.#config, roomId, schemaName, schemaVersion)];
      this.#dbs.set(roomId, entry);
    } else {
      const db = entry[1];
      if (db.schemasMatch(schemaName, schemaVersion)) {
        entry[0] += 1;
      } else {
        // TODO: note that this is not 100% accurate. We could be running an old schema version
        // in a cached db and use this as a trigger to tear down existing connections and upgrade the schema.
        throw new Error(
          `Requested a schema name and version that the server does not have.`
        );
      }
    }
    return entry[1];
  }

  unref(roomId: string) {
    logger.info(`Remove db from cache for room "${roomId}"`);
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
