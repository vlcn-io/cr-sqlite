import {
  EstablishOutboundStreamMsg,
  GetChangesResponse,
  StreamingChangesMsg,
  tags,
} from "../Types";
import { Seq } from "../Types";
import DB from "./DB";
import FSNotify from "./FSNotify";
import ServiceDB from "./ServiceDB";
import util from "./util";

/**
 * We could use this in our p2p setup too.
 * Starts an outbound stream. Streams either all changes made to the db
 * or only local writes that took place on the db.
 */
export default class OutboundStream {
  private readonly listeners = new Set<
    (changes: StreamingChangesMsg) => void
  >();

  private toDbid: Uint8Array;
  private since: Seq;

  constructor(
    private readonly fsnotify: FSNotify,
    private readonly serviceDb: ServiceDB,
    establishMsg: EstablishOutboundStreamMsg,
    type: "LOCAL_WRITES" | "ALL_WRITES" = "ALL_WRITES"
  ) {
    this.toDbid = establishMsg.remoteDbid;
    this.since = establishMsg.seqStart;

    // do schema version check here.
    // throw if mismatch.
  }

  start() {
    this.fsnotify.addListener(util.bytesToHex(this.toDbid), this.#dbChanged);
  }

  #dbChanged = (db: DB) => {
    const changes = db.getChanges(this.toDbid, this.since[0]);
    if (changes.length == 0) {
      return;
    }

    const msg: StreamingChangesMsg = {
      _tag: tags.streamingChanges,
      seqStart: this.since,
      seqEnd: [changes[changes.length - 1][5], 0],
      changes,
    };
    for (const l of this.listeners) {
      try {
        l(msg);
      } catch (e) {
        console.error(e);
      }
    }

    // next message in the stream picks up from where this left off.
    this.since = msg.seqEnd;
  };

  // registers with FSNotify
  // emits events which includes changes.
  // update since.
  // if receiver ends up out of order, receiver should tear down sse stream
  // and restart it.
  close() {
    this.fsnotify.removeListener(util.bytesToHex(this.toDbid), this.#dbChanged);
  }
}
