import { ISerializer, hexToBytes, tags } from "@vlcn.io/direct-connect-common";
import { Endpoints } from "../Types";
import { DB, RECEIVE, Version } from "./DB";
import Fetcher from "./Fetcher";

export default class InboundStream {
  // TODO: can we apply back-pressure so the server doesn't overwhelm us with sync events?
  private started: boolean = false;
  private shutdown: boolean = false;
  private readonly fetcher: Fetcher;
  private eventSource: EventSource | null = null;

  constructor(
    private readonly db: DB,
    endpoints: Endpoints,
    serializer: ISerializer
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
    const seq = await this.db.seqIdFor(remoteDbid, RECEIVE);
    this.eventSource = this.fetcher.startOutboundStream({
      _tag: tags.establishOutboundStream,
      toDbid: remoteDbid,
      fromDbid: hexToBytes(this.db.localDbid),
      seqStart: seq,
      schemaVersion: this.db.schemaVersion,
    });

    this.eventSource.onmessage = this._msgReceivedFromServer;
  }

  stop() {
    this.started = false;
    this.shutdown = true;
  }

  _msgReceivedFromServer = (ev: MessageEvent<any>) => {
    console.log(ev);
  };

  // apply in batches over some throttle period? Or just collect while we're waiting
  // the last operation then process the whole next batch.
  _applyChangeset(seqEnd: readonly [Version, number]) {
    // ensure we're contiguous
    // then update peer tracker / our record of the server
    // await this.updatePeerTracker(tx, from, RECEIVE, seqEnd);
  }
}
