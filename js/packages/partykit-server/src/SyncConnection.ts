import {
  AnnouncePresence,
  Changes,
  RejectChanges,
} from "@vlcn.io/partykit-common";
import type { PartyKitConnection, PartyKitRoom } from "partykit/server";
import DBCache from "./DBCache.js";
import OutboundStream from "./OutboundStream.js";
import InboundStream from "./InboundStream.js";
import Transport from "./Trasnport.js";

/**
 *
 */
export default class SyncConnection {
  readonly #db;
  readonly #dbCache;
  readonly #room;
  readonly #outboundStream;
  readonly #inboundStream;

  constructor(
    dbCache: DBCache,
    ws: PartyKitConnection,
    room: PartyKitRoom,
    msg: AnnouncePresence
  ) {
    this.#dbCache = dbCache;
    this.#db = dbCache.getAndRef(room.id, msg.schemaName, msg.schemaVersion);
    this.#room = room;
    const transport = new Transport(ws);

    this.#outboundStream = new OutboundStream(
      transport,
      this.#db,
      msg.lastSeens
    );
    this.#inboundStream = new InboundStream(transport, this.#db, msg.sender);
  }

  start() {
    // - start our oubound stream based on `lastSeens`
    // - what if last seens don't match the room? New last seen..
    //   room name is db file name but db site id is in the db.
    //    so room name is just a handle to db.
    // - ask the connected peer to start streaming their changes
    // since the last time _we_ saw them.

    // prepare to receive from...
    // the dude that announced his presence.
    // ask him to start his stream to us.
    this.#inboundStream.start();
    this.#outboundStream.start();
  }

  receiveChanges(changes: Changes) {
    this.#inboundStream.receiveChanges(changes);
  }

  changesRejected(rejection: RejectChanges) {
    this.#outboundStream.reset(rejection);
  }

  close() {
    this.#outboundStream.stop();
    // tell the cache we're done. It'll close the db on 0 references.
    this.#dbCache.unref(this.#room.id);
  }
}
