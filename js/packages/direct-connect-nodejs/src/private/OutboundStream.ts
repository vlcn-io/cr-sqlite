import {
  EstablishOutboundStreamMsg,
  GetChangesResponse,
  StreamingChangesMsg,
  tags,
  Seq,
  bytesToHex,
} from "@vlcn.io/direct-connect-common";
import DB from "./DB.js";
import FSNotify from "./FSNotify.js";
import ServiceDB from "./ServiceDB.js";
import logger from "../logger.js";

/**
 * We could use this in our p2p setup too.
 * Starts an outbound stream. Streams either all changes made to the db
 * or only local writes that took place on the db.
 */
export default class OutboundStream {
  private readonly listeners = new Set<
    (changes: StreamingChangesMsg) => void
  >();

  // Stream changes from local
  private localDbid: Uint8Array;
  // To remote
  private remoteDbid: Uint8Array;
  private since: Seq;

  constructor(
    private readonly fsnotify: FSNotify,
    private readonly serviceDb: ServiceDB,
    establishMsg: EstablishOutboundStreamMsg,
    type: "LOCAL_WRITES" | "ALL_WRITES" = "ALL_WRITES"
  ) {
    this.localDbid = establishMsg.toDbid;
    this.remoteDbid = establishMsg.fromDbid;
    this.since = establishMsg.seqStart;

    // do schema version check here.
    // throw if mismatch.
  }

  start() {
    const localdbid = bytesToHex(this.localDbid);
    this.fsnotify.addListener(localdbid, this.#dbChanged);
  }

  addListener(l: (changes: StreamingChangesMsg) => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  #dbChanged = (db: DB) => {
    logger.info("db changed");
    const changes = db.getChanges(this.remoteDbid, this.since[0]);
    if (changes.length == 0) {
      logger.info("change length is 0");
      return;
    }

    const msg: StreamingChangesMsg = {
      _tag: tags.streamingChanges,
      seqStart: this.since,
      seqEnd: [changes[changes.length - 1][5], 0],
      changes,
    };
    logger.info("sending changes to listeners");
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
    this.fsnotify.removeListener(bytesToHex(this.localDbid), this.#dbChanged);
    this.listeners.clear();
  }
}
