import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

export type CID = string;
export type QuoteConcatedPKs = string;
export type TableName = string;
export type Version = bigint;
export type Val = string;

export type Msg =
  | ChangesReceivedMsg
  | ChangesRequestedMsg
  | ChangesAckedMsg
  | EstablishConnectionMsg;

export type Changeset = [
  TableName,
  QuoteConcatedPKs,
  CID,
  Val,
  Version, // col version
  Version // db version
  // site_id is omitted. Will be applied by the receiver
  // who always knows site ids in client-server setup.
  // server masks site ids of clients. This masking
  // is disallowed in p2p topologies.
];

/**
 * Socket abstraction. Exposes the methods required by
 * the sync layer and allows users to implement the socket however
 * they like. E.g., via WebSockets, Socket.io, Rest, GraphQL, other
 */
export interface Socket {
  onclose?: (code: number, reason: any) => void;
  onmessage?: (data: Uint8Array) => void;

  send(data: Uint8Array): void;
  closeForError(code?: number, data?: any): void;
  removeAllListeners(): void;
}

export type ChangesReceivedMsg = Readonly<{
  _tag: "receive";
  from: Uint8Array;
  /**
   * seqStart must always be equal to
   * seqEnd from the prior message that was sent (or the change request msg if first change).
   * This is to ensure ordered delivery.
   *
   * seqStart thus does not necessarilly correspond
   * to the smallest version nunmber in the changeset.
   *
   * seqEnd, however, will be the largest version number
   * in the changeset.
   *
   * Since versions can never run backwards,
   * seqEnd will never be duplicative
   *
   * The second element in the tuple
   * is for future use when we allow breaking
   * apart large transactions into many messages.
   */
  seqStart: readonly [Version, number];
  seqEnd: readonly [Version, number];
  changes: readonly Changeset[];
}>;

export type ChangesRequestedMsg = Readonly<{
  _tag: "request";
  seqStart: readonly [Version, number];
}>;

export type ChangesAckedMsg = Readonly<{
  _tag: "ack";
  seqEnd: readonly [Version, number];
}>;

export type EstablishConnectionMsg = Readonly<{
  _tag: "establish";
  from: Uint8Array;
  to: Uint8Array;
  seqStart: [Version, number];
  // if the db doesn't exist the user can create it
  // with the provided schema name.
  // obviously we need some form of auth around this
  // and tracking as to how much data the user is using.
  create?: {
    schemaName: string;
  };
}>;

type MsgType = Msg["_tag"];

const typeToBin: { [K in MsgType]: number } = {
  ack: 0,
  establish: 1,
  receive: 2,
  request: 3,
} as const;

const binToType = {
  0: "ack",
  1: "establish",
  2: "receive",
  3: "request",
} as const;

export function encodeMsg(msg: Msg): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeUint8(encoder, typeToBin[msg._tag]);
  switch (msg._tag) {
    case "ack":
      encoding.writeBigInt64(encoder, msg.seqEnd[0]);
      encoding.writeVarInt(encoder, msg.seqEnd[1]);
      return encoding.toUint8Array(encoder);
    case "establish":
      encoding.writeUint8Array(encoder, msg.from);
      encoding.writeUint8Array(encoder, msg.to);
      encoding.writeBigInt64(encoder, msg.seqStart[0]);
      encoding.writeVarInt(encoder, msg.seqStart[1]);
      if (msg.create) {
        encoding.writeVarString(encoder, msg.create.schemaName);
      }
      return encoding.toUint8Array(encoder);
    case "receive":
      encoding.writeUint8Array(encoder, msg.from);
      encoding.writeBigInt64(encoder, msg.seqStart[0]);
      encoding.writeVarInt(encoder, msg.seqStart[1]);
      encoding.writeBigInt64(encoder, msg.seqEnd[0]);
      encoding.writeVarInt(encoder, msg.seqEnd[1]);
      encoding.writeVarUint(encoder, msg.changes.length);
      for (const change of msg.changes) {
        encoding.writeVarString(encoder, change[0]);
        encoding.writeVarString(encoder, change[1]);
        encoding.writeVarString(encoder, change[2]);
        encoding.writeVarString(encoder, change[3]);
        encoding.writeBigInt64(encoder, change[4]);
        encoding.writeBigInt64(encoder, change[5]);
      }
      return encoding.toUint8Array(encoder);
    case "request":
      encoding.writeBigInt64(encoder, msg.seqStart[0]);
      encoding.writeVarInt(encoder, msg.seqStart[1]);
      return encoding.toUint8Array(encoder);
  }

  throw new Error(`Unexpected msg._tag in encodeMsg ${msg}`);
}

export function decodeMsg(msg: Uint8Array): Msg {
  const decoder = decoding.createDecoder(msg);
  const type = decoding.readUint8(decoder);
  switch (type) {
    case 0:
      return {
        _tag: "ack",
        seqEnd: [decoding.readBigInt64(decoder), decoding.readVarInt(decoder)],
      };
    case 1:
      return {
        _tag: "establish",
        from: decoding.readUint8Array(decoder, 16),
        to: decoding.readUint8Array(decoder, 16),
        seqStart: [
          decoding.readBigInt64(decoder),
          decoding.readVarInt(decoder),
        ],
        create: decoding.hasContent(decoder)
          ? { schemaName: decoding.readVarString(decoder) }
          : undefined,
      };
    case 2:
      return {
        _tag: "receive",
        from: decoding.readUint8Array(decoder, 16),
        seqStart: [
          decoding.readBigInt64(decoder),
          decoding.readVarInt(decoder),
        ],
        seqEnd: [decoding.readBigInt64(decoder), decoding.readVarInt(decoder)],
        changes: Array.from({ length: decoding.readVarUint(decoder) }, () => [
          decoding.readVarString(decoder),
          decoding.readVarString(decoder),
          decoding.readVarString(decoder),
          decoding.readVarString(decoder),
          decoding.readBigInt64(decoder),
          decoding.readBigInt64(decoder),
        ]),
      };
    case 3:
      return {
        _tag: "request",
        seqStart: [
          decoding.readBigInt64(decoder),
          decoding.readVarInt(decoder),
        ],
      };
  }

  throw new Error(`Unexpected msg type ${type}`);
}

export function randomUuidBytes(): Uint8Array {
  return hexToBytes(crypto.randomUUID().replaceAll("-", ""));
}

function hexToBytes(hex: string) {
  const ret = new Uint8Array(16);
  for (let c = 0; c < hex.length; c += 2) {
    ret[c / 2] = parseInt(hex.substring(c, c + 2), 16);
  }
  return ret;
}
