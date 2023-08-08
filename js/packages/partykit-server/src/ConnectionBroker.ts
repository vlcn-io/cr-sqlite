import { Msg, tags } from "@vlcn.io/partykit-common";
import type { PartyKitConnection, PartyKitRoom } from "partykit/server";
import SyncConnection from "./SyncConnection.js";
import DBCache from "./DBCache.js";

/**
 * A connection broker maps PartyKit connections to Database Sync connections
 * and dispatches messages from the PartyKitConnection to the appropriate
 * SyncConnection methods.
 */
export default class ConnectionBroker {
  readonly #syncConnections = new Map<string, SyncConnection>();
  readonly #dbCache;

  constructor(dbCache: DBCache) {
    this.#dbCache = dbCache;
  }

  handleMessage(ws: PartyKitConnection, room: PartyKitRoom, msg: Msg) {
    const tag = msg._tag;
    switch (tag) {
      case tags.AnnouncePresence: {
        if (this.#syncConnections.has(ws.id)) {
          throw new Error(`A sync connection for ${ws.id} was already started`);
        }

        const syncConnection = new SyncConnection(this.#dbCache, ws, room, msg);
        this.#syncConnections.set(ws.id, syncConnection);
        syncConnection.start();
        return;
      }
      case tags.Changes: {
        // get our synced db from the cache
        // apply the changes
        // if no inbound stream is started, this'll start one.
        const syncConn = this.#getSyncConnX(ws);
        syncConn.receiveChanges(msg);
        return;
      }
      case tags.RejectChanges: {
        // get our synced db, tell it changes were rejected
        const syncConn = this.#getSyncConnX(ws);
        syncConn.changesRejected(msg);
        return;
      }
      case tags.StartStreaming: {
        throw new Error(
          `Illegal state -- servers do not process the "StartTreaming" message`
        );
        // the server does not process this message. It sends this message
        // to a client after a client has announced its presence.
        return;
      }
    }
  }

  close(ws: PartyKitConnection) {
    const syncConn = this.#syncConnections.get(ws.id);
    if (syncConn) {
      syncConn.close();
    }
  }

  #getSyncConnX(ws: PartyKitConnection) {
    const syncConn = this.#syncConnections.get(ws.id);
    if (syncConn == null) {
      throw new Error(`Illegal state -- missing sync conn for ${ws.id}`);
    }
    return syncConn;
  }
}
