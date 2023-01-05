import { test, expect } from "vitest";
import fc from "fast-check";
import { encodeMsg, decodeMsg } from "../index.js";

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
      fc.string(),
      fc.string(),
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
      fc.string(),
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

test("fail case", () => {
  const msg = {
    _tag: "request",
    seqStart: [9223372036854775807n, 0],
  } as const;
  const encoded = encodeMsg(msg);
  const decoded = decodeMsg(encoded);
  expect(decoded).toEqual(msg);
});
