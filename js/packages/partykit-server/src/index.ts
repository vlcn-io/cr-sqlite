import type { PartyKitServer } from "partykit/server";

export default {
  onConnect(ws, room) {
    ws.addEventListener("message", (evt) => {
      console.log(evt.data);
    });
  },
} satisfies PartyKitServer;

/**
 * Create with persistence.
 * - Transport...
 * - DB Provider...
 *
 * Similar to client. Can we make it same as client?
 */
