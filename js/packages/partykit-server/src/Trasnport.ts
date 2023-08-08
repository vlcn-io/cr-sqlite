import {
  Changes,
  RejectChanges,
  StartStreaming,
} from "@vlcn.io/partykit-common";
import type { PartyKitConnection } from "partykit/server";

export default class Transport {
  constructor(ws: PartyKitConnection) {}

  sendChanges(msg: Changes) {}
  rejectChanges(msg: RejectChanges) {}
  startStreaming(msg: StartStreaming) {}
}
