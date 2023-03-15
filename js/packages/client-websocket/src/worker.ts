// Worker to do syncing off of the main thread
import "./shim.js";
import { default as createReplicator } from "@vlcn.io/client-core";
import { DBChange, Init, Msg } from "./messageTypes.js";
import WebSocketWrapper from "./WebSocketWrapper.js";
import sqliteWasm from "@vlcn.io/crsqlite-wasm";
import tblrx from "@vlcn.io/rx-tbl";

// @ts-ignore
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";

class FakeRx {
  private callbacks: Set<() => void> = new Set();

  onAny(cb: () => void) {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }

  notify() {
    this.callbacks.forEach((cb) => cb());
  }
}

class Syncer {
  private initialized = false;
  private realRx: ReturnType<typeof tblrx> | null = null;
  private fakeRx: FakeRx;

  constructor() {
    this.fakeRx = new FakeRx();
  }

  async init(msg: Init) {
    if (this.initialized) {
      throw new Error("Already initialized");
    } else {
      this.initialized = true;
    }

    const sqlite = await sqliteWasm((_file) => wasmUrl);
    const db = await sqlite.open(msg.dbname);

    // the "real rx" is used to pass messages up to the main thread
    this.realRx = tblrx(db);

    const replicator = await createReplicator({
      localDb: db,
      remoteDbId: msg.remoteDbId,
      // the "fake rx" is used to tell the replicator to sync when we receive
      // change messages from the main thread.
      rx: this.fakeRx,
      create: msg.create,
      accessToken: msg.accessToken,
    });
    const wrapper = new WebSocketWrapper(msg.uri, replicator, msg.accessToken);
    wrapper.start();

    this.realRx.__internalRawListener = (collectedChanges) => {
      console.log(collectedChanges);
      const msg: DBChange = {
        _tag: "db_change",
        collectedChanges,
      };
      self.postMessage(msg);
    };
  }

  requestSync() {
    this.fakeRx.notify();
  }
}

const syncer = new Syncer();
self.onmessage = (e) => {
  const msg = e.data as Msg;

  switch (msg._tag) {
    case "init":
      syncer.init(msg);
      break;
    case "request_sync":
      syncer.requestSync();
      break;
  }
};
