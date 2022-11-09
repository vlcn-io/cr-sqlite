import * as React from "react";
import { Ctx } from "./hooks";
import { useState } from "react";

export default function Peers({ ctx }: { ctx: Ctx }) {
  const [peerId, setPeerId] = useState<string>("");
  return (
    <div className="peers">
      <input
        type="text"
        onChange={(e) => setPeerId(e.target.value)}
        value={peerId}
      ></input>
      <a
        href="#"
        onClick={() => {
          ctx.sqlite.connectTo(ctx.dbid, peerId);
        }}
      >
        Connect
      </a>
    </div>
  );
}
