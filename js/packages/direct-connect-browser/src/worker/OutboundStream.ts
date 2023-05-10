import { ISerializer } from "@vlcn.io/direct-connect-common";
import { Endpoints } from "../Types.js";
import { DB, Seq } from "./DB.js";

export default class OutboundStream {
  private started: boolean = false;
  private shutdown: boolean = false;
  private seq: Seq | null = null;

  // from our DB to the server.
  // The server should tell us from which point to start.
  constructor(
    db: DB,
    endpoints: Endpoints,
    private readonly serializer: ISerializer
  ) {}

  start(seq: Seq) {
    if (this.started || this.shutdown) {
      return;
    }
    this.started = true;
  }

  nextTick() {
    // pull changes from the local DB
    if (this.seq == null) {
      // init not yet complete
      return;
    }
  }

  stop() {
    this.shutdown = true;
    this.started = false;
  }
}
