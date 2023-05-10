import { ISerializer, hexToBytes, tags } from "@vlcn.io/direct-connect-common";
import { Endpoints } from "../Types";
import { DB, RECEIVE, Version } from "./DB";
import Fetcher from "./Fetcher";

export default class InboundStream {
  // from the server into us.
  // we tell the server from where to start.
  // this'll be driven by server sent events.
  // When we apply changes from the inbound stream, ping the connected tabs.
  // TODO: can we apply back-pressure so the server doesn't overwhelm us with sync events?
  private started: boolean = false;
  private shutdown: boolean = false;
  private readonly fetcher: Fetcher;

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
    const resp = await this.fetcher.establishOutboundStream({
      _tag: tags.establishOutboundStream,
      toDbid: remoteDbid,
      fromDbid: hexToBytes(this.db.localDbid),
      seqStart: seq,
      schemaVersion: this.db.schemaVersion,
    });

    // resp should contain the endpoint to use for sse...?
  }

  stop() {
    this.started = false;
    this.shutdown = true;
  }

  _applyChangeset(seqEnd: readonly [Version, number]) {
    // ensure we're contiguous
    // then update peer tracker / our record of the server
    // await this.updatePeerTracker(tx, from, RECEIVE, seqEnd);
    // then tell synceddb a sync event completed.
    // pass it the collection of table names...
    // or should we depend on `rx-tbl` for this?
  }
}
