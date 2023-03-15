import { test, expect } from "vitest";
import fc from "fast-check";
import { encodeMsg, decodeMsg, randomUuidBytes } from "../index.js";
import { stringify as uuidStringify, parse as uuidParse } from "uuid";
import * as crypto from "node:crypto";

if (typeof global.crypto === "undefined") {
  (global as any).crypto = crypto;
}

test("encoded, decode pairing ack", () => {
  fc.assert(
    fc.property(fc.tuple(fc.bigIntN(64), fc.integer()), (seqEnd) => {
      const msg = { _tag: "ack", seqEnd } as const;
      const encoded = encodeMsg(msg);
      const decoded = decodeMsg(encoded);
      expect(decoded).toEqual(msg);
    })
  );
});

test("encoded, decode pairing establish", () => {
  fc.assert(
    fc.property(
      fc.uint8Array({ minLength: 16, maxLength: 16 }),
      fc.uint8Array({ minLength: 16, maxLength: 16 }),
      fc.tuple(fc.bigIntN(64), fc.integer()),
      fc.option(fc.string()),
      (from, to, seqStart, create) => {
        const msg = {
          _tag: "establish",
          from,
          to,
          seqStart,
          create: create
            ? {
                schemaName: create,
              }
            : undefined,
        } as const;
        const encoded = encodeMsg(msg);
        const decoded = decodeMsg(encoded);
        expect(decoded).toEqual(msg);
      }
    )
  );
});

test("encoded, decode pairing receive", () => {
  fc.assert(
    fc.property(
      fc.uint8Array({ minLength: 16, maxLength: 16 }),
      fc.tuple(fc.bigIntN(64), fc.integer()),
      fc.tuple(fc.bigIntN(64), fc.integer()),
      fc.array(
        fc.tuple(
          fc.string(),
          fc.string(),
          fc.string(),
          fc.string(),
          fc.bigIntN(64),
          fc.bigIntN(64)
        ),
        {
          minLength: 0,
          maxLength: 100,
        }
      ),
      (from, seqStart, seqEnd, changes) => {
        const msg = {
          _tag: "receive",
          from,
          seqStart,
          seqEnd,
          changes,
        } as const;
        const encoded = encodeMsg(msg);
        const decoded = decodeMsg(encoded);
        expect(decoded).toEqual(msg);
      }
    )
  );
});

test("encoded, decode pairing request", () => {
  fc.assert(
    fc.property(fc.tuple(fc.bigIntN(64), fc.integer()), (seqStart) => {
      const msg = { _tag: "request", seqStart } as const;
      const encoded = encodeMsg(msg);
      const decoded = decodeMsg(encoded);
      expect(decoded).toEqual(msg);
    })
  );
});

test("uuid byte generation", () => {
  const uuid = randomUuidBytes();
  const uuidString = uuidStringify(uuid);
  // console.log(uuid);
  // console.log(uuidString);
  // console.log(uuidParse(uuidString));
  expect(uuidParse(uuidString)).toEqual(uuid);
});
