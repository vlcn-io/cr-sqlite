import {
  Changes,
  RejectChanges,
  StartStreaming,
  encode,
} from "@vlcn.io/partykit-common";
import type { PartyKitConnection } from "partykit/server";

/**
 * Abstracts over the exact transport so we can swap out to any transport (http, websockets, tcp, etc) we want.
 */
export default class Transport {
  readonly #ws;
  constructor(ws: PartyKitConnection) {
    this.#ws = ws;
  }

  sendChanges(msg: Changes) {
    this.#ws.send(encode(msg));
  }
  rejectChanges(msg: RejectChanges) {
    this.#ws.send(encode(msg));
  }
  startStreaming(msg: StartStreaming) {
    this.#ws.send(encode(msg));
  }
}
