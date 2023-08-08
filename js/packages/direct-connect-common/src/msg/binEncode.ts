/**
 * Creates a binary encoding of the message types using lib0
 */

import * as encoding from "lib0/encoding";
import { Change, Msg, tags } from "../types.js";

export default function encode(msg: Msg): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeUint8(encoder, msg._tag);
  switch (msg._tag) {
    case tags.applyChanges:
      encoding.writeUint8Array(encoder, msg.toDbid);
      encoding.writeUint8Array(encoder, msg.fromDbid);
      encoding.writeBigInt64(encoder, msg.schemaVersion);
      encoding.writeBigInt64(encoder, msg.seqStart[0]);
      encoding.writeVarUint(encoder, msg.seqStart[1]);
      encoding.writeBigInt64(encoder, msg.seqEnd[0]);
      encoding.writeVarUint(encoder, msg.seqEnd[1]);
      writeChanges(encoder, msg.changes);
      return encoding.toUint8Array(encoder);
    case tags.getChanges:
      encoding.writeUint8Array(encoder, msg.dbid);
      encoding.writeUint8Array(encoder, msg.requestorDbid);
      encoding.writeBigInt64(encoder, msg.schemaVersion);
      encoding.writeBigInt64(encoder, msg.since[0]);
      encoding.writeVarUint(encoder, msg.since[1]);
      return encoding.toUint8Array(encoder);
    case tags.establishOutboundStream:
      encoding.writeUint8Array(encoder, msg.toDbid);
      encoding.writeUint8Array(encoder, msg.fromDbid);
      encoding.writeBigInt64(encoder, msg.schemaVersion);
      encoding.writeBigInt64(encoder, msg.seqStart[0]);
      encoding.writeVarUint(encoder, msg.seqStart[1]);
      return encoding.toUint8Array(encoder);
    case tags.getLastSeen:
      encoding.writeUint8Array(encoder, msg.toDbid);
      encoding.writeUint8Array(encoder, msg.fromDbid);
      return encoding.toUint8Array(encoder);
    case tags.getLastSeenResponse:
      encoding.writeBigInt64(encoder, msg.seq[0]);
      encoding.writeVarUint(encoder, msg.seq[1]);
      return encoding.toUint8Array(encoder);
    case tags.getChangesResponse:
      encoding.writeBigInt64(encoder, msg.seqStart[0]);
      encoding.writeVarUint(encoder, msg.seqStart[1]);
      encoding.writeBigInt64(encoder, msg.seqEnd[0]);
      encoding.writeVarUint(encoder, msg.seqEnd[1]);
      writeChanges(encoder, msg.changes);
      return encoding.toUint8Array(encoder);
    case tags.createOrMigrate:
      encoding.writeUint8Array(encoder, msg.dbid);
      encoding.writeUint8Array(encoder, msg.requestorDbid);
      encoding.writeVarString(encoder, msg.schemaName);
      encoding.writeBigInt64(encoder, msg.schemaVersion);
      return encoding.toUint8Array(encoder);
    case tags.createOrMigrateResponse:
      encoding.writeVarString(encoder, msg.status);
      encoding.writeBigInt64(encoder, msg.seq[0]);
      encoding.writeVarUint(encoder, msg.seq[1]);
      return encoding.toUint8Array(encoder);
    case tags.ackChanges:
      encoding.writeBigInt64(encoder, msg.seqEnd[0]);
      encoding.writeVarUint(encoder, msg.seqEnd[1]);
      return encoding.toUint8Array(encoder);
    case tags.streamingChanges:
      encoding.writeBigInt64(encoder, msg.seqStart[0]);
      encoding.writeVarUint(encoder, msg.seqStart[1]);
      encoding.writeBigInt64(encoder, msg.seqEnd[0]);
      encoding.writeVarUint(encoder, msg.seqEnd[1]);
      writeChanges(encoder, msg.changes);
      return encoding.toUint8Array(encoder);
    case tags.applyChangesResponse:
      return encoding.toUint8Array(encoder);
    case tags.establishOutboundStreamResponse:
      return encoding.toUint8Array(encoder);
    case tags.uploadSchema:
      encoding.writeVarString(encoder, msg.name);
      encoding.writeBigUint64(encoder, msg.version);
      encoding.writeVarString(encoder, msg.content);
      encoding.writeUint8(encoder, msg.activate ? 1 : 0);
      return encoding.toUint8Array(encoder);
    case tags.activateSchema:
      encoding.writeVarString(encoder, msg.name);
      encoding.writeBigUint64(encoder, msg.version);
      return encoding.toUint8Array(encoder);
  }
}

export const NULL = 0;
export const BIGINT = 1;
export const NUMBER = 2;
export const STRING = 3;
export const BOOL = 4;
export const BLOB = 5;

function writeChanges(encoder: encoding.Encoder, changes: readonly Change[]) {
  encoding.writeVarUint(encoder, changes.length);
  for (const change of changes) {
    encoding.writeVarString(encoder, change[0]);
    encoding.writeVarUint8Array(encoder, change[1]);
    encoding.writeVarString(encoder, change[2]);
    if (change[3] === null) {
      encoding.writeUint8(encoder, NULL);
    } else {
      if (typeof change[3] === "bigint") {
        encoding.writeUint8(encoder, BIGINT);
        encoding.writeBigInt64(encoder, change[3]);
      } else if (typeof change[3] === "number") {
        encoding.writeUint8(encoder, NUMBER);
        encoding.writeFloat64(encoder, change[3]);
      } else if (typeof change[3] === "string") {
        encoding.writeUint8(encoder, STRING);
        encoding.writeVarString(encoder, change[3]);
      } else if (typeof change[3] === "boolean") {
        encoding.writeUint8(encoder, BOOL);
        encoding.writeUint8(encoder, change[3] ? 1 : 0);
      } else if (change[3].constructor === Uint8Array) {
        encoding.writeUint8(encoder, BLOB);
        encoding.writeVarUint8Array(encoder, change[3]);
      } else {
        console.log(change[3]);
        throw new Error(
          `Unsupported value type: ${typeof change[3]} ${change[3]}`
        );
      }
    }
    encoding.writeBigInt64(encoder, change[4]);
    encoding.writeBigInt64(encoder, change[5]);
    encoding.writeBigInt64(encoder, change[6]);
  }
}
