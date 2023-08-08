import { AnnouncePresence } from "@vlcn.io/partykit-common";
import type { PartyKitConnection, PartyKitRoom } from "partykit/server";

/**
 *
 */
export default class SyncConnection {
  constructor(
    ws: PartyKitConnection,
    room: PartyKitRoom,
    msg: AnnouncePresence
  ) {}

  start() {
    // - start our oubound stream based on `lastSeens`
    // - what if last seens don't match the room? New last seen..
    //   room name is db file name but db site id is in the db.
    //    so room name is just a handle to db.
    // - ask the connected peer to start streaming their changes
    // since the last time _we_ saw them.
  }

  close() {}
}
