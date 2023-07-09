import DBCache from "./DBCache.js";
import { Config } from "../Types.js";
import util from "./util.js";
import DB from "./DB.js";
import chokidar from "chokidar";
import { collect } from "./collapser.js";
import path from "path";

/**
 * Notifies outbound streams of changes to the database file.
 *
 * These changes could be made by other connections, processes or even other regions when running on litefs.
 */
export default class FSNotify {
  private readonly watcher: chokidar.FSWatcher;
  private readonly listeners = new Map<string, Set<(db: DB) => void>>();
  private readonly fileChanged;

  constructor(
    private readonly config: Config,
    private readonly cache: DBCache
  ) {
    // If we're OSX, only watch poke files.
    // TODO: collapse events over some period? So we only notify for 1 db at most once every N ms.
    console.log("Pat:", this.config.dbsDir + "/*");
    this.watcher = chokidar.watch(this.config.dbsDir + path.sep + "*", {
      followSymlinks: false,
      usePolling: false,
      interval: 100,
      binaryInterval: 300,
      ignoreInitial: true,
    });
    this.fileChanged = collect(config.notifyLatencyInMs, (paths: string[]) => {
      const dedupedDbids = new Set(
        paths.map((p) => util.fileEventNameToDbId(p))
      );
      for (const dbid of dedupedDbids) {
        const listeners = this.listeners.get(dbid);
        if (listeners != null) {
          for (const listener of listeners) {
            try {
              listener(this.cache.getStr(dbid));
            } catch (e) {
              console.error(e);
            }
          }
        }
      }
    });
    this.watcher.on("change", this.fileChanged);
  }

  addListener(dbid: string, cb: (db: DB) => void) {
    const listeners = this.listeners.get(dbid);
    if (listeners == null) {
      this.listeners.set(dbid, new Set([cb]));
    } else {
      listeners.add(cb);
    }

    // Fire an event on registration so state is sent out immediately.
    setTimeout(() => {
      cb(this.cache.getStr(dbid));
    }, 0);
  }

  removeListener(dbid: string, cb: (db: DB) => void) {
    const listeners = this.listeners.get(dbid);
    if (listeners != null) {
      listeners.delete(cb);
      if (listeners.size === 0) {
        this.listeners.delete(dbid);
      }
    }
  }

  shutdown() {
    this.watcher.close();
  }
}
