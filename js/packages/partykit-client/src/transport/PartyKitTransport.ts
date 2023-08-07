import PartySocket, { PartySocketOptions } from "partysocket";
import { Transport } from "./Transport";
import {
  AnnouncePresence,
  Changes,
  RejectChanges,
  StartStreaming,
  decode,
  encode,
  tags,
} from "@vlcn.io/partykit-common";

export default class PartyKitTransport implements Transport {
  #socket;
  #hadStartStream = false;

  constructor(options: PartySocketOptions) {
    this.#socket = new PartySocket(options);

    this.#socket.addEventListener("message", this.#processEvent);
  }

  onChangesReceived: ((msg: Changes) => Promise<void>) | null = null;
  onStartStreaming: ((msg: StartStreaming) => Promise<void>) | null = null;
  onResetStream: ((msg: StartStreaming) => Promise<void>) | null = null;

  #processEvent = (e: MessageEvent<any>) => {
    const msg = decode(e.data);
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
}
