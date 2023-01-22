import * as React from "react";
import { useState, useEffect } from "react";
import { Ctx } from "./ctx.js";

export default function Peers({ ctx }: { ctx: Ctx }) {
  const [peerId, setPeerId] = useState<string>("");
  const [pending, setPending] = useState<string[]>([]);
  const [established, setEstablished] = useState<string[]>([]);

  useEffect(() => {
    const cleanup = ctx.rtc.onConnectionsChanged((pending, established) => {
      console.log("conns changes");
      setPending(pending);
      setEstablished(established);
    });
    return () => {
      cleanup();
    };
  }, [ctx.rtc]);
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
          ctx.rtc.connectTo(peerId);
        }}
      >
        Connect
      </a>
      <ul className="pending">
        {pending.map((p) => (
          <li id={p}>{p.substring(0, 8)}</li>
        ))}
      </ul>
      <ul className="established">
        {established.map((p) => (
          <li id={p}>{p.substring(0, 8)}</li>
        ))}
      </ul>
    </div>
  );
}
