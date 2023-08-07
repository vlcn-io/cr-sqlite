import { Transport } from "./transport/Transport.js";

export default class SyncedDB {
  #transport;
  #inboundStream;
  #outboundStream;

  constructor(transportProvider: () => Transport) {
    // wire SyncedDB into Transport
    // Announce our prsence
    this.#transport = transportProvider();
    this.#inboundStream = new InboundStream();
    this.#outboundStream = new OutboundStream();
    this.#transport.onChangesReceived = this.#inboundStream.onChangesReceived;
    this.#transport.onStartStreaming = this.#outboundStream.onStartStreaming;
    this.#transport.onResetStream = this.#outboundStream.onResetStream;
  }

  start() {
    this.#transport.announcePresence();
  }

  stop() {
    return true;
  }
}

export async function createSyncedDB(
  dbName: string,
  transportProvider: () => Transport
): Promise<SyncedDB> {
  return new SyncedDB(transportProvider);
}
