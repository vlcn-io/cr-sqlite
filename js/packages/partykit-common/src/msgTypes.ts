export type Msg = AnnouncePresence | Changes | RejectChanges | StartStreaming;

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
  // Site id... we could optimize out . . .
  Uint8Array,
  CausalLength
];

export type AnnouncePresence = Readonly<{
  _tag: Tags["AnnouncePresence"];
  sender: Uint8Array;
  lastSeens: [Uint8Array, [bigint, number]][];
  schemaVersion: bigint;
}>;

export type Changes = Readonly<{
  _tag: Tags["Changes"];
  sender: Uint8Array;
  since: [bigint, number];
  changes: Change[];
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
  schemaVersion: bigint;
}>;
