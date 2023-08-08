import {
  Changes,
  RejectChanges,
  StartStreaming,
  encode,
} from "@vlcn.io/ws-common";
import { WebSocket } from "ws";

/**
 * Abstracts over the exact transport so we can swap out to any transport (http, websockets, tcp, etc) we want.
 */
export default class Transport {
  readonly #ws;
  constructor(ws: WebSocket) {
    this.#ws = ws;
  }

  sendChanges(msg: Changes) {
    this.#ws.send(encode(msg));
    // TODO: return back pressure if too much is buffered.
    // this.#ws.bufferedAmount
  }

  rejectChanges(msg: RejectChanges) {
    this.#ws.send(encode(msg));
  }

  startStreaming(msg: StartStreaming) {
    this.#ws.send(encode(msg));
  }
}
