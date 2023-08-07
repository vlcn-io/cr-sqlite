import type { PartyKitServer } from "partykit/server";

export default {
  onConnect(ws, room) {
    ws.addEventListener("message", (evt) => {
      console.log(evt.data);
    });
  },
} satisfies PartyKitServer;
