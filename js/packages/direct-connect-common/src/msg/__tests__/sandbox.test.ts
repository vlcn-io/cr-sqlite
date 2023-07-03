import { test, expect } from "vitest";
import BinarySerializer from "../BinarySerializer";
import { StreamingChangesMsg, tags } from "../../types";
import JsonSerializer from "../JsonSerializer";

test("sandbox", () => {
  const msg = {
    _tag: tags.streamingChanges,
    seqStart: [0n, 0],
    seqEnd: [0n, 0],
    changes: [["", Uint8Array.from([0]), "", "", 0n, 0n]],
  } as const;
  const s = new JsonSerializer();

  const encoded = s.encode(msg);
  const decoded = s.decode(encoded);
});
