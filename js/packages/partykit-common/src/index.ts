export type Msg = AnnouncePresence | Changes | RejectChanges;

export const tags = {
  AnnouncePresence: 1,
  Changes: 2,
  RejectChanges: 3,
  StartStreaming: 4,
} as const;

export type Tags = typeof tags;

export type CID = string;
export type PackedPks = Uint8Array;
export type TableName = string;
export type Version = bigint;
export type CausalLength = bigint;
export type Val = any;

export type Change = readonly [
  TableName,
  PackedPks,
  CID,
  Val,
  Version, // col version
  Version, // db version
  // site_id is omitted. Will be applied by the receiver
  // who always knows site ids in client-server setup.
  // server masks site ids of clients. This masking
  // is disallowed in p2p topologies.
  CausalLength
];

export type AnnouncePresence = Readonly<{
  _tag: Tags["AnnouncePresence"];
  sender: Uint8Array;
  lastSeens: [Uint8Array, [bigint, number]][];
}>;

export type Changes = Readonly<{
  _tag: Tags["Changes"];
  sender: Uint8Array;
  since: [bigint, number];
  until: [bigint, number];
  changes: Change[];
  schemaVersion: bigint;
}>;

export type RejectChanges = Readonly<{
  _tag: Tags["RejectChanges"];
  whose: Uint8Array;
  since: [bigint, number];
}>;

export type StartStreaming = Readonly<{
  _tag: Tags["StartStreaming"];
  since: [bigint, number];
  excludeSites: Uint8Array[];
  localOnly: boolean;
}>;
