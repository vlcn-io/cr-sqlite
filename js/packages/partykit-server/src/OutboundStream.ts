import { RejectChanges } from "@vlcn.io/partykit-common";
import DB from "./DB.js";
import Transport from "./Trasnport.js";

/**
 * Listens to the local db and sends out a stream
 * of changes over the transport.
 */
export default class OutboundStream {
  constructor(
    transport: Transport,
    db: DB,
    lastSeens: [Uint8Array, [bigint, number]][]
  ) {}

  start() {
    // 1. get the site id of our local db
    // 2. figure out the lastSeen for it based on lastSeens
    // 3. listen for db change events
    // 4. start publishing changes over the transport
  }

  reset(msg: RejectChanges) {
    // the peer rejected our changes.
    // re-wind our stream back.
  }

  stop() {}
}
