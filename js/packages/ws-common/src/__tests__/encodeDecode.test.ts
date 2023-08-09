// encode / decode each msg type
import { test, expect } from "vitest";
import fc from "fast-check";
import { AnnouncePresence, tags } from "../msgTypes.js";
import { decode } from "../decode.js";
import { encode } from "../encode.js";

test("encoded, decode pairing AnnouncePresence", () => {
  fc.assert(
    fc.property(
      fc.uint8Array({ minLength: 16, maxLength: 16 }),
      fc.array(
        fc.tuple(
          fc.uint8Array({ minLength: 16, maxLength: 16 }),
          fc.tuple(fc.bigIntN(64), fc.integer({ min: 0 }))
        )
      ),
      fc.string(),
      fc.bigIntN(64),
      (sender, lastSeens, schemaName, schemaVersion) => {
        const msg: AnnouncePresence = {
          _tag: tags.AnnouncePresence,
          sender,
          lastSeens,
          schemaName,
          schemaVersion,
        } as const;
        const encoded = encode(msg);
        const decoded = decode(encoded);
        expect(decoded).toEqual(msg);
      }
    )
  );
});

// test("example", () => {
//   const [sender, since, changes] = [
//     Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
//     [0n, 0],
//     [
//       [
//         "",
//         Uint8Array.from([0]),
//         "",
//         undefined,
//         0n,
//         0n,
//         Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
//         0n,
//       ],
//     ],
//   ] as const;

//   const msg = {
//     _tag: tags.Changes,
//     sender,
//     since,
//     changes,
//   } as const;

//   const encoded = encode(msg);
//   const decoded = decode(encoded);
//   console.log(decoded);
// });

test("encoded, decode pairing Changes", () => {
  fc.assert(
    fc.property(
      fc.uint8Array({ minLength: 16, maxLength: 16 }),
      fc.tuple(fc.bigIntN(64), fc.integer({ min: 0 })),
      fc.array(
        fc.tuple(
          fc.string(),
          fc.uint8Array({ minLength: 1, maxLength: 10 }),
          fc.string(),
          fc.oneof(
            fc.string(),
            fc.boolean(),
            fc.integer(),
            fc.double(),
            fc.constant(null),
            fc.bigInt({
              min: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
              max: 9223372036854775807n,
            }),
            fc.uint8Array()
          ),
          fc.bigIntN(64),
          fc.bigIntN(64),
          fc.oneof(
            fc.uint8Array({ minLength: 16, maxLength: 16 }),
            fc.constant(null)
          ),
          fc.bigIntN(64)
        )
      ),
      (sender, since, changes) => {
        const msg = {
          _tag: tags.Changes,
          sender,
          since,
          changes,
        } as const;
        const encoded = encode(msg);
        const decoded = decode(encoded);
        expect(decoded).toEqual(msg);
      }
    )
  );
});

test("encoded, decode pairing RejectChanges", () => {
  fc.assert(
    fc.property(
      fc.uint8Array({ minLength: 16, maxLength: 16 }),
      fc.tuple(fc.bigIntN(64), fc.integer({ min: 0 })),
      (whose, since) => {
        const msg = {
          _tag: tags.RejectChanges,
          whose,
          since,
        } as const;
        const encoded = encode(msg);
        const decoded = decode(encoded);
        expect(decoded).toEqual(msg);
      }
    )
  );
});

test("encoded, decode pairing StartStreaming", () => {
  fc.assert(
    fc.property(
      fc.tuple(fc.bigIntN(64), fc.integer({ min: 0 })),
      fc.array(fc.uint8Array({ minLength: 16, maxLength: 16 })),
      fc.boolean(),
      (since, excludeSites, localOnly) => {
        const msg = {
          _tag: tags.StartStreaming,
          since,
          excludeSites,
          localOnly,
        } as const;
        const encoded = encode(msg);
        const decoded = decode(encoded);
        expect(decoded).toEqual(msg);
      }
    )
  );
});
