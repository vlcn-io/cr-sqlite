import { WorkerInterface } from "@vlcn.io/direct-connect-browser";
import initWasm, { SQLite3 } from "@vlcn.io/crsqlite-wasm";
import tblrx from "@vlcn.io/rx-tbl";
import { CtxAsync } from "../context.js";

// TODO: xplat-api new pkg has these types
export type DBID = string;
export type Schema = {
  namespace: string;
  name: string;
  active: boolean;
  content: string;
};

const dbMap = new Map<DBID, Promise<CtxAsync>>();
const hooks = new Map<DBID, () => CtxAsync | null>();

export type SyncEdnpoints = {
  createOrMigrate: URL;
  applyChanges: URL;
  startOutboundStream: URL;
  worker?: string;
  wasm?: string;
};

let initPromise: Promise<SQLite3> | null = null;
function init(wasmUri?: string) {
  if (initPromise) {
    return initPromise;
  }

  initPromise = initWasm(wasmUri ? () => wasmUri : undefined);
  return initPromise;
}

const dbFactory = {
  async get(
    dbid: DBID,
    schema: Schema,
    endpoints: SyncEdnpoints,
    hook?: () => CtxAsync | null
  ) {
    if (hook) {
      hooks.set(dbid, hook);
    }
    if (dbMap.has(dbid)) {
      return await dbMap.get(dbid)!;
    }

    const entry = (async () => {
      const sqlite = await init(endpoints.wasm);
      const db = await sqlite.open(dbid);
      await db.automigrateTo(schema.name, schema.content);
      const rx = tblrx(db);
      const syncWorker = new WorkerInterface(endpoints.worker);
      syncWorker.startSync(endpoints.wasm, dbid as any, endpoints);
      return {
        db,
        rx,
      };
    })();
    dbMap.set(dbid, entry);

    return await entry;
  },

  async closeAndRemove(dbid: DBID) {
    const db = await dbMap.get(dbid);
    hooks.delete(dbid);
    if (db) {
      dbMap.delete(dbid);
      db.rx.dispose();
      await db.db.close();
    }
  },

  getHook(dbid: DBID) {
    return hooks.get(dbid);
  },
} as const;

export default dbFactory;
