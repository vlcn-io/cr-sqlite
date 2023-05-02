import { Endpoints } from "../Types";

export default class InboundStream {
  // from the server into us.
  // we tell the server from where to start.
  // this'll be driven by server sent events.
  // When we apply changes from the inbound stream, ping the connected tabs.
  // TODO: can we apply back-pressure so the server doesn't overwhelm us with sync events?
  private started: boolean = false;

  constructor(dbid: string, endpoints: Endpoints) {}

  start() {
    if (this.started) {
      return;
    }
    this.started = true;

    // ask the server for changes
  }
}
