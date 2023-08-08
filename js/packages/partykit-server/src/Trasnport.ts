import {
  Changes,
  RejectChanges,
  StartStreaming,
} from "@vlcn.io/partykit-common";
import type { PartyKitConnection } from "partykit/server";

export default class Transport {
  readonly #ws;
  constructor(ws: PartyKitConnection) {
    this.#ws = ws;
  }

  sendChanges(msg: Changes) {}
  rejectChanges(msg: RejectChanges) {}
  startStreaming(msg: StartStreaming) {}
}
