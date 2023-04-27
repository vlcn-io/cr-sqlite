import DBCache from "../DBCache";
import { Config } from "../Types";
import util from "../util";
import DB from "./DB";
import chokidar from "chokidar";

// notifies outbound streams when db change events occur for a given db.
// watches the db directory for filesystem changes.
// debounces and collects over some time?
export default class FSNotify {
  private readonly watcher: chokidar.FSWatcher;
  private readonly listeners = new Map<string, Set<(db: DB) => void>>();

  constructor(
    private readonly config: Config,
    private readonly cache: DBCache
  ) {
    // If we're OSX, only watch poke files.
    // TODO: collapse events over some period? So we only notify for 1 db at most once every N ms.
    console.log("Pat:", this.config.dbsDir + "/*");
    this.watcher = chokidar.watch(this.config.dbsDir + "/*", {
      followSymlinks: false,
      usePolling: false,
      interval: 100,
      binaryInterval: 300,
      ignoreInitial: true,
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

  private fileChanged = (path: string) => {
    console.log("file changes: ", path);
    const dbid = util.fileEventNameToDbId(path);
    const listeners = this.listeners.get(dbid);
    if (listeners != null) {
      for (const listener of listeners) {
        try {
          listener(this.cache.getDb(dbid));
        } catch (e) {
          console.error(e);
        }
      }
    }
  };
}
