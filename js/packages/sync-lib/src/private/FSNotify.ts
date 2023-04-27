import DBCache from "../DBCache";
import { Config } from "../Types";
import util from "../util";
import DB from "./DB";
import watchman from "fb-watchman";

// notifies outbound streams when db change events occur for a given db.
// watches the db directory for filesystem changes.
// debounces and collects over some time?
class FSNotify {
  private readonly listeners = new Map<string, Set<(db: DB) => void>>();

  constructor(
    private readonly config: Config,
    private readonly cache: DBCache,
    private readonly watchmanClient: watchman.Client,
    private readonly subscriptionName: string
  ) {
    console.log("Watching ", this.config.dbsDir);
    this.watchmanClient.on("subscription", this.filesChanged);
  }

  addListener(dbid: string, cb: (db: DB) => void) {
    console.log("adding listener for dbid", dbid);
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
    this.watchmanClient.end();
  }

  private filesChanged = (resp: any) => {
    console.log(resp);
    if (resp.subscription !== this.subscriptionName) {
      return;
    }
    for (const file of resp.files) {
      this.fileChanged(file.name);
    }
  };

  private fileChanged(filename: string) {
    const dbid = util.fileEventNameToDbId(filename);
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
  }
}

export function createFsNotify(
  config: Config,
  cache: DBCache
): Promise<FSNotify> {
  const client = new watchman.Client();
  return new Promise((resolve, reject) => {
    client.capabilityCheck(
      {
        optional: [],
        required: ["relative_root"],
      },
      (err, resp) => {
        if (err) {
          console.error(err);
          client.end();
          reject(err);
          return;
        }
        client.command(["watch-project", config.dbsDir], (err, resp) => {
          if (err) {
            console.error(err);
            reject(err);
            return;
          }

          if ("warning" in resp) {
            console.warn(resp.warning);
          }

          makeTimeConstraintedSubscription(
            config,
            cache,
            client,
            resp.watch,
            resp.relative_path,
            resolve,
            reject
          );
        });
      }
    );
  });
}

let subid = 0;
function makeTimeConstraintedSubscription(
  config: Config,
  cache: DBCache,
  client: watchman.Client,
  watch: any,
  relativePath: any,
  resolve: (fsNotify: FSNotify) => void,
  reject: (err: any) => void
) {
  client.command(["clock", watch], (err, resp) => {
    if (err) {
      console.error(err);
      reject(err);
      return;
    }

    const sub = {
      expression: ["allof", ["match", "*.db"]],
      fields: ["name"],
      since: resp.clock,
    };

    if (relativePath) {
      (sub as any).relative_root = relativePath;
    }

    subid += 1;
    client.command(["subscribe", watch, "sub-" + subid, sub], (err, resp) => {
      if (err) {
        console.error(err);
        reject(err);
        return;
      }
      console.log("subscription " + resp.subscribe + " established");
      const fsNotify = new FSNotify(config, cache, client, resp.subscribe);
      resolve(fsNotify);
    });
  });
}

// const fsNotify = new FSNotify(config, cache);
