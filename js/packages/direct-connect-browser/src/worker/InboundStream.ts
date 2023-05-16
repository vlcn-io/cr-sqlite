import {
  ISerializer,
  Seq,
  StreamingChangesMsg,
  hexToBytes,
  tags,
} from "@vlcn.io/direct-connect-common";
import { Endpoints } from "../Types";
import { DB, RECEIVE, Version } from "./DB";
import Fetcher from "./Fetcher";
import { TXAsync } from "@vlcn.io/xplat-api";

export default class InboundStream {
  // TODO: can we apply back-pressure so the server doesn't overwhelm us with sync events?
  private started: boolean = false;
  private shutdown: boolean = false;
  private readonly fetcher: Fetcher;
  private eventSource: EventSource | null = null;
  private seq: Seq | null = null;

  private inflightWrite: Promise<void> | null = null;
  private pendingWrites: StreamingChangesMsg[] = [];

  constructor(
    private readonly db: DB,
    endpoints: Endpoints,
    private readonly serializer: ISerializer
  ) {
    this.fetcher = new Fetcher(endpoints, serializer);
  }

  async start() {
    if (this.started || this.shutdown) {
      return;
    }
    this.started = true;

    // now start the outbound stream from the server to us
    // from when we last RECEIVED an update from the server.
    const remoteDbid = hexToBytes(this.db.remoteDbid);
    this.seq = await this.db.seqIdFor(remoteDbid, RECEIVE);
    this.eventSource = this.fetcher.startOutboundStream({
      _tag: tags.establishOutboundStream,
      toDbid: remoteDbid,
      fromDbid: hexToBytes(this.db.localDbid),
      seqStart: this.seq,
      schemaVersion: this.db.schemaVersion,
    });

    this.eventSource.onmessage = this._msgReceivedFromServer;
  }

  stop() {
    this.started = false;
    this.shutdown = true;
  }

  _msgReceivedFromServer = (ev: MessageEvent<any>) => {
    const msg = this.serializer.decode(JSON.parse(ev.data));
    console.log(msg);
    switch (msg._tag) {
      case tags.establishOutboundStreamResponse:
        if (msg.status !== "ok") {
          throw new Error(msg.status);
        }
        console.log(`inbound stream established`);
        break;
      case tags.streamingChanges:
        this.#collectChangesetMsg(msg);
        break;
      default:
        throw new Error(`Unexpected message type ${msg._tag}`);
    }
  };

  // apply in batches over some throttle period? Or just collect while we're waiting
  // the last operation then process the whole next batch.
  #collectChangesetMsg(msg: StreamingChangesMsg) {
    // ensure we're contiguous
    // then update peer tracker / our record of the server
    // await this.updatePeerTracker(tx, from, RECEIVE, seqEnd);
    if (this.shutdown) {
      return;
    }

    this.pendingWrites.push(msg);
    if (this.inflightWrite != null) {
      return;
    }

    // Queue here rather than at the DB so the DB can continue processing higher priority events.
    const writes = this.pendingWrites;
    this.pendingWrites = [];
    this.inflightWrite = this.#applyAllChangesetMsgs(writes);
  }

  async #applyAllChangesetMsgs(writes: StreamingChangesMsg[]) {
    await this.db.db.tx(async (tx) => {
      for (const msg of writes) {
        await this.#applyChangesetMsg(tx, msg);
      }
    });
  }

  async #applyChangesetMsg(tx: TXAsync, msg: StreamingChangesMsg) {
    if (this.seq == null) {
      throw new Error("Receive a message before we have a seq");
    }
    if (msg.seqStart[0] != this.seq[0]) {
      throw new Error(
        `Expected seqStart v ${this.seq} but got ${msg.seqStart}`
      );
    }
    if (msg.seqStart[1] != this.seq[1]) {
      throw new Error(
        `Expected seqStart s ${this.seq} but got ${msg.seqStart}`
      );
    }

    await this.db.applyChangeset(tx, msg.changes);
    await this.db.updatePeerTracker(tx, RECEIVE, msg.seqEnd);
  }
}
