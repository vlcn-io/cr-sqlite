import { Msg, tags } from "@vlcn.io/partykit-common";
import type { PartyKitConnection, PartyKitRoom } from "partykit/server";
import SyncConnection from "./SyncConnection.js";

/**
 * We'll need to generalize this so it isn't PartyKit specific but what this is doing:
 * - Mapping WebSocket connections to `SyncConnection`s
 * - A sync connection represents the sync protocol level concerns for
 * syncing two dbs together.
 * -
 */
export default class ConnectionBroker {
  #syncConnections = new Map<string, SyncConnection>();

  handleMessage(ws: PartyKitConnection, room: PartyKitRoom, msg: Msg) {
    const tag = msg._tag;
    switch (tag) {
      case tags.AnnouncePresence:
        if (this.#syncConnections.has(ws.id)) {
          throw new Error(`A sync connection for ${ws.id} was already started`);
        }

        const syncConnection = new SyncConnection(ws, room, msg);
        this.#syncConnections.set(ws.id, syncConnection);
        syncConnection.start();

        // stand up a synced connection
        // start our outbound stream
        // since the presence announcement includes `lastSeens`
        // and we know from where to start.
        // send the client a `start streaming` message so the client can start
        // its outbound stream
        return;
      case tags.Changes:
        // get our synced db from the cache
        // apply the changes
        // if no inbound stream is started, this'll start one.
        //
        return;
      case tags.RejectChanges:
        // get our synced db, tell it changes were rejected
        return;
      case tags.StartStreaming:
        // the server does not process this message. It sends this message
        // to a client after a client has announced its presence.
        return;
    }
  }

  close(ws: PartyKitConnection) {
    const syncConn = this.#syncConnections.get(ws.id);
    if (syncConn) {
      syncConn.close();
    }
  }
}
