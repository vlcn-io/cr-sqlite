/**
 * Decode a binary message
 *
 * TODO: use varints for everything rather than bigint64. We often are using small numbers that never reach anything close to their limit which is i64
 */

import * as decoding from "lib0/decoding";
import { Change, Msg, tags } from "../types.js";
import { BIGINT, BLOB, BOOL, NULL, NUMBER, STRING } from "./binEncode.js";

export default function decode(msg: Uint8Array): Msg {
  const decoder = decoding.createDecoder(msg);
  const tag = decoding.readUint8(decoder);
  switch (tag) {
    case tags.applyChanges:
      return {
        _tag: tags.applyChanges,
        toDbid: decoding.readUint8Array(decoder, 16),
        fromDbid: decoding.readUint8Array(decoder, 16),
        schemaVersion: decoding.readBigInt64(decoder),
        seqStart: [
          decoding.readBigInt64(decoder),
          decoding.readVarUint(decoder),
        ],
        seqEnd: [decoding.readBigInt64(decoder), decoding.readVarUint(decoder)],
        changes: readChanges(decoder),
      };
    case tags.getChanges:
      return {
        _tag: tags.getChanges,
        dbid: decoding.readUint8Array(decoder, 16),
        requestorDbid: decoding.readUint8Array(decoder, 16),
        schemaVersion: decoding.readBigInt64(decoder),
        since: [decoding.readBigInt64(decoder), decoding.readVarUint(decoder)],
      };
    case tags.establishOutboundStream:
      return {
        _tag: tags.establishOutboundStream,
        toDbid: decoding.readUint8Array(decoder, 16),
        fromDbid: decoding.readUint8Array(decoder, 16),
        schemaVersion: decoding.readBigInt64(decoder),
        seqStart: [
          decoding.readBigInt64(decoder),
          decoding.readVarUint(decoder),
        ],
      };
    case tags.getLastSeen:
      return {
        _tag: tags.getLastSeen,
        toDbid: decoding.readUint8Array(decoder, 16),
        fromDbid: decoding.readUint8Array(decoder, 16),
      };
    case tags.getLastSeenResponse:
      return {
        _tag: tags.getLastSeenResponse,
        seq: [decoding.readBigInt64(decoder), decoding.readVarUint(decoder)],
      };
    case tags.getChangesResponse:
      return {
        _tag: tags.getChangesResponse,
        seqStart: [
          decoding.readBigInt64(decoder),
          decoding.readVarUint(decoder),
        ],
        seqEnd: [decoding.readBigInt64(decoder), decoding.readVarUint(decoder)],
        changes: readChanges(decoder),
      };
    case tags.createOrMigrate:
      return {
        _tag: tags.createOrMigrate,
        dbid: decoding.readUint8Array(decoder, 16),
        requestorDbid: decoding.readUint8Array(decoder, 16),
        schemaName: decoding.readVarString(decoder),
        schemaVersion: decoding.readBigInt64(decoder),
      };
    case tags.createOrMigrateResponse:
      return {
        _tag: tags.createOrMigrateResponse,
        status: decoding.readVarString(decoder) as any,
        seq: [decoding.readBigInt64(decoder), decoding.readVarUint(decoder)],
      };
    case tags.ackChanges:
      return {
        _tag: tags.ackChanges,
        seqEnd: [decoding.readBigInt64(decoder), decoding.readVarUint(decoder)],
      };
    case tags.streamingChanges:
      return {
        _tag: tags.streamingChanges,
        seqStart: [
          decoding.readBigInt64(decoder),
          decoding.readVarUint(decoder),
        ],
        seqEnd: [decoding.readBigInt64(decoder), decoding.readVarUint(decoder)],
        changes: readChanges(decoder),
      };
    case tags.applyChangesResponse:
      return {
        _tag: tags.applyChangesResponse,
      };
    case tags.establishOutboundStreamResponse:
      return {
        _tag: tags.establishOutboundStreamResponse,
      };
    case tags.uploadSchema:
      return {
        _tag: tags.uploadSchema,
        name: decoding.readVarString(decoder),
        version: decoding.readBigInt64(decoder),
        content: decoding.readVarString(decoder),
        activate: decoding.readUint8(decoder) === 1,
      };
    case tags.activateSchema:
      return {
        _tag: tags.activateSchema,
        name: decoding.readVarString(decoder),
        version: decoding.readBigInt64(decoder),
      };
    default:
      throw new Error(`Unknown tag ${tag}`);
  }
}

function readChanges(decoder: decoding.Decoder) {
  return Array.from({ length: decoding.readVarUint(decoder) }, () => [
    decoding.readVarString(decoder),
    decoding.readVarUint8Array(decoder),
    decoding.readVarString(decoder),
    (() => {
      const type = decoding.readUint8(decoder);
      switch (type) {
        case NULL:
          return null;
        case BIGINT:
          return decoding.readBigInt64(decoder);
        case NUMBER:
          return decoding.readFloat64(decoder);
        case STRING:
          return decoding.readVarString(decoder);
        case BOOL:
          return decoding.readUint8(decoder) === 1 ? true : false;
        case BLOB:
          return decoding.readVarUint8Array(decoder);
      }
      throw new Error(`Unknown type ${type}`);
    })(),
    decoding.readBigInt64(decoder),
    decoding.readBigInt64(decoder),
    decoding.readBigInt64(decoder),
  ]) as Change[];
}
