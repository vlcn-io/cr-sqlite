import { ISerializer, hexToBytes, tags } from "@vlcn.io/direct-connect-common";
import { Endpoints } from "../Types.js";
import { DB, Seq } from "./DB.js";
import Fetcher from "./Fetcher.js";

// TODO: you need to add exception handling to the caller of `nextTick`
// and have them restart the connection on failure.
export default class OutboundStream {
  private started: boolean = false;
  private shutdown: boolean = false;
  private seq: Seq | null = null;
  private inflightTick: Promise<void> | null = null;
  private hasPendingTick: boolean = false;
  private readonly fetcher: Fetcher;

  // from our DB to the server.
  // The server should tell us from which point to start.
  constructor(
    private readonly db: DB,
    endpoints: Endpoints,
    serializer: ISerializer
  ) {
    this.fetcher = new Fetcher(endpoints, serializer);
  }

  start(seq: Seq) {
    if (this.started || this.shutdown) {
      return;
    }
    this.started = true;
    this.seq = seq;

    this.nextTick();
  }

  nextTick() {
    console.log("next tick!");
    // pull changes from the local DB
    if (this.seq == null || this.shutdown) {
      // init not yet complete
      return;
    }

    if (this.inflightTick != null) {
      this.hasPendingTick = true;
      return this.inflightTick;
    }

    // only start a new tick if we're not already sending some changes.
    this.inflightTick = this._nextTick();
  }

  async _nextTick(): Promise<void> {
    // pull changes from the local DB
    if (this.seq == null) {
      return;
    }

    const changes = await this.db.pullChangeset(this.seq);
    if (changes.length === 0) {
      return;
    }
    const seqEnd = [changes[changes.length - 1][5], 0] as const;

    const resp = await this.fetcher.applyChanges({
      _tag: tags.applyChanges,
      toDbid: hexToBytes(this.db.remoteDbid),
      fromDbid: hexToBytes(this.db.localDbid),
      schemaVersion: this.db.schemaVersion,
      seqStart: this.seq!,
      seqEnd,
      changes,
    });

    if (resp.status === "ok") {
      this.seq = resp.seqEnd!;
    } else {
      throw new Error(`failed to apply changes on remote: ${resp.status}`);
    }

    this.inflightTick = null;
    if (this.hasPendingTick) {
      this.hasPendingTick = false;
      this.nextTick();
    }
  }

  stop() {
    this.shutdown = true;
    this.started = false;
  }
}
