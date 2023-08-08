import { Transport } from "./Transport";
import {
  AnnouncePresence,
  Changes,
  RejectChanges,
  StartStreaming,
  decode,
  encode,
  tags,
} from "@vlcn.io/ws-common";

export type TransporOptions = {
  url: string;
  room: string;
};
export default class WebSocketTransport implements Transport {
  #socket;
  #hadStartStream = false;
  #closed = false;

  constructor(options: TransporOptions) {
    this.#socket = this.#openSocketAndKeepAlive(options);
  }

  // TODO: add ping-pong and reconnection?
  #openSocketAndKeepAlive(options: TransporOptions) {
    const socket = new WebSocket(options.url, ["room", options.room]);

    socket.addEventListener("message", (e: MessageEvent<Blob>) => {
      e.data.arrayBuffer().then((b) => {
        this.#processEvent(new Uint8Array(b));
      });
    });

    socket.onclose = () => {
      if (!this.#closed) {
        setTimeout(() => {});
      }
    };

    socket.onerror = () => {
      this.close();
    };

    return socket;
    // https://stackoverflow.com/questions/22431751/websocket-how-to-automatically-reconnect-after-it-dies
  }

  onChangesReceived: ((msg: Changes) => Promise<void>) | null = null;
  onStartStreaming: ((msg: StartStreaming) => Promise<void>) | null = null;
  onResetStream: ((msg: StartStreaming) => Promise<void>) | null = null;

  #processEvent = (data: Uint8Array) => {
    const msg = decode(new Uint8Array(data));
    switch (msg._tag) {
      case tags.AnnouncePresence:
      case tags.RejectChanges:
        // clients should not receive these evnts
        throw new Error(`Unexpected event: ${msg._tag}`);
      case tags.Changes:
        if (this.onChangesReceived) {
          this.onChangesReceived(msg);
        }
        return;
      case tags.StartStreaming:
        if (this.#hadStartStream) {
          this.onResetStream && this.onResetStream(msg);
        } else {
          this.#hadStartStream = true;
          this.onStartStreaming && this.onStartStreaming(msg);
        }
    }
  };

  async announcePresence(msg: AnnouncePresence): Promise<void> {
    this.#socket.send(encode(msg));
  }

  async sendChanges(msg: Changes): Promise<void> {
    // TODO: hm... we can't see if it is still in-flight?
    // or if we should back off on sending?
    // Ideally we could observe the socket and back off on sending if we're sending too frequently for the
    // receiver.
    this.#socket.send(encode(msg));
  }

  async rejectChanges(msg: RejectChanges): Promise<void> {
    this.#socket.send(encode(msg));
  }

  close() {
    this.#closed = true;
    this.#socket.close();
  }
}
