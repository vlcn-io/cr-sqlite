import { Endpoints } from "../Types.js";
import { Seq } from "./DB.js";

export default class OutboundStream {
  private started: boolean = false;
  private seq: Seq | null = null;

  // from our DB to the server.
  // The server should tell us from which point to start.
  constructor(dbid: string, endpoints: Endpoints) {}

  start() {
    if (this.started) {
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
}
