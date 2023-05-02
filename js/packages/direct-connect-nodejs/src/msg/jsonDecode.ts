// decode json strings to correct types.
// do appropriate validations on:
// - db names
// - schema names
// - bigint conversions

import { Change, Msg, Tag, tags } from "../Types.js";
import util from "../private/util.js";

export default function decode(msg: string): Msg {
  const parsed = JSON.parse(msg);
  switch (parsed._tag as Tag[keyof Tag]) {
    case tags.applyChanges:
      return {
        _tag: tags.applyChanges,
        toDbid: util.hexToBytes(parsed.toDbid),
        fromDbid: util.hexToBytes(parsed.fromDbid),
        schemaVersion: parsed.schemaName,
        seqStart: [BigInt(parsed.seqStart[0]), parsed.seqStart[1]],
        seqEnd: [BigInt(parsed.seqEnd[0]), parsed.seqEnd[1]],
        changes: decodeChanges(parsed.changes),
      };
    case tags.getChanges:
      return {
        _tag: tags.getChanges,
        dbid: util.hexToBytes(parsed.dbid),
        requestorDbid: util.hexToBytes(parsed.requestorDbid),
        schemaVersion: parsed.schemaName,
        since: [BigInt(parsed.since[0]), parsed.since[1]],
      };
    case tags.establishOutboundStream:
      return {
        _tag: tags.establishOutboundStream,
        toDbid: util.hexToBytes(parsed.toDbid),
        fromDbid: util.hexToBytes(parsed.fromDbid),
        schemaVersion: parsed.schemaName,
        seqStart: [BigInt(parsed.seqStart[0]), parsed.seqStart[1]],
      };
    case tags.getLastSeen:
      return {
        _tag: tags.getLastSeen,
        toDbid: util.hexToBytes(parsed.toDbid),
        fromDbid: util.hexToBytes(parsed.fromDbid),
      };
    case tags.getLastSeenResponse:
      return {
        _tag: tags.getLastSeenResponse,
        seq: [BigInt(parsed.seq[0]), parsed.seq[1]],
      };
    case tags.getChangesResponse:
      return {
        _tag: tags.getChangesResponse,
        seqStart: [BigInt(parsed.seqStart[0]), parsed.seqStart[1]],
        seqEnd: [BigInt(parsed.seqEnd[0]), parsed.seqEnd[1]],
        changes: decodeChanges(parsed.changes),
      };
    case tags.createOrMigrate:
      return {
        _tag: tags.createOrMigrate,
        dbid: util.hexToBytes(parsed.dbid),
        schemaName: parsed.schemaName,
        schemaVersion: parsed.schemaName,
      };
    case tags.createOrMigrateResponse:
      return {
        _tag: tags.createOrMigrateResponse,
        status: parsed.status,
      };
    case tags.ackChanges:
      return {
        _tag: tags.ackChanges,
        seqEnd: [BigInt(parsed.seq[0]), parsed.seq[1]],
      };
    case tags.applyChangesResponse:
      return {
        _tag: tags.applyChangesResponse,
        status: parsed.status,
        seqEnd: [BigInt(parsed.seqEnd[0]), parsed.seqEnd[1]],
        msg: parsed.msg,
      };
    case tags.streamingChanges:
      return {
        _tag: tags.streamingChanges,
        seqStart: [BigInt(parsed.seqStart[0]), parsed.seqStart[1]],
        seqEnd: [BigInt(parsed.seqEnd[0]), parsed.seqEnd[1]],
        changes: decodeChanges(parsed.changes),
      };
    case tags.uploadSchema:
      return parsed;
    case tags.activateSchema:
      return parsed;
  }
}

function decodeChanges(changes: any[]): Change[] {
  return changes.map((c) => {
    return [c[0], c[1], c[2], c[3], BigInt(c[4]), BigInt(c[5])];
  });
}
