// bigint to string conversions
// given a msg types, encodes it to a json string.
// - converts uint8array to hex string
// - converts bigint to string

import { Change, Msg, tags } from "../types.js";
import { bytesToHex } from "../util.js";

export default function encode(msg: Msg): Object {
  // implement encode
  switch (msg._tag) {
    case tags.applyChanges:
      return {
        _tag: tags.applyChanges,
        toDbid: bytesToHex(msg.toDbid),
        fromDbid: bytesToHex(msg.fromDbid),
        schemaVersion: msg.schemaVersion.toString(),
        seqStart: [msg.seqStart[0].toString(), msg.seqStart[1]],
        seqEnd: [msg.seqEnd[0].toString(), msg.seqEnd[1]],
        changes: encodeChanges(msg.changes),
      };
    case tags.getChanges:
      return {
        _tag: tags.getChanges,
        dbid: bytesToHex(msg.dbid),
        requestorDbid: bytesToHex(msg.requestorDbid),
        schemaVersion: msg.schemaVersion.toString(),
        since: [msg.since[0].toString(), msg.since[1]],
      };
    case tags.establishOutboundStream:
      return {
        _tag: tags.establishOutboundStream,
        toDbid: bytesToHex(msg.toDbid),
        fromDbid: bytesToHex(msg.fromDbid),
        schemaVersion: msg.schemaVersion.toString(),
        seqStart: [msg.seqStart[0].toString(), msg.seqStart[1]],
      };
    case tags.getLastSeen:
      return {
        _tag: tags.getLastSeen,
        toDbid: bytesToHex(msg.toDbid),
        fromDbid: bytesToHex(msg.fromDbid),
      };
    case tags.getLastSeenResponse:
      return {
        _tag: tags.getLastSeenResponse,
        seq: [msg.seq[0].toString(), msg.seq[1]],
      };
    case tags.getChangesResponse:
      return {
        _tag: tags.getChangesResponse,
        seqStart: [msg.seqStart[0].toString(), msg.seqStart[1]],
        seqEnd: [msg.seqEnd[0].toString(), msg.seqEnd[1]],
        changes: encodeChanges(msg.changes),
      };
    case tags.createOrMigrate:
      return {
        _tag: tags.createOrMigrate,
        dbid: bytesToHex(msg.dbid),
        requestorDbid: bytesToHex(msg.requestorDbid),
        schemaName: msg.schemaName,
        schemaVersion: msg.schemaVersion.toString(),
      };
    case tags.createOrMigrateResponse:
      return {
        _tag: tags.createOrMigrateResponse,
        status: msg.status,
        seq: [msg.seq[0].toString(), msg.seq[1]],
      };
    case tags.ackChanges:
      return {
        _tag: tags.ackChanges,
        seqEnd: [msg.seqEnd[0].toString(), msg.seqEnd[1]],
      };
    case tags.streamingChanges:
      return {
        _tag: tags.streamingChanges,
        seqStart: [msg.seqStart[0].toString(), msg.seqStart[1]],
        seqEnd: [msg.seqEnd[0].toString(), msg.seqEnd[1]],
        changes: encodeChanges(msg.changes),
      };
    case tags.applyChangesResponse:
      return {
        _tag: tags.applyChangesResponse,
      };
    case tags.establishOutboundStreamResponse:
      return msg;
    case tags.uploadSchema:
      return {
        _tag: msg._tag,
        name: msg.name,
        version: msg.version.toString(),
        content: msg.content,
        activate: msg.activate,
      };
    case tags.activateSchema:
      return {
        _tag: tags.activateSchema,
        name: msg.name,
        version: msg.version.toString(),
      };
  }
}

function encodeChanges(changes: readonly Change[]): readonly any[] {
  return changes.map((c) => {
    return [
      c[0],
      bytesToHex(c[1]),
      c[2],
      encodeValue(c[3]),
      c[4].toString(),
      c[5].toString(),
      c[6].toString(),
    ];
  });
}

/**
 * A comedy of problems.
 * 1. JavaScript Number type only goes up to 53 bits.
 * 2. JavaScript does have BigInt to get around this.
 * 3. BigInt, however, cannot be serialized to JSON.
 *
 * Given (3), we need to convert BigInts to Numbers but given (1)
 * we have to convert BigInts > 53 bits to strings.
 */
function encodeValue(x: any) {
  if (typeof x === "bigint") {
    if (x > Number.MAX_SAFE_INTEGER) {
      return x.toString();
    } else {
      return Number(x);
    }
  } else if (x == null) {
    return null;
  } else if (typeof x === "object" && x.constructor === Uint8Array) {
    const hex = bytesToHex(x);
    return [hex];
  }
  return x;
}
