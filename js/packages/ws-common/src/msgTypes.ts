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

export type Change =
  | readonly [
      TableName,
      PackedPks,
      CID,
      Val,
      Version, // col version
      Version, // db version
      Uint8Array | null,
      CausalLength
    ];

export type AnnouncePresence = Readonly<{
  _tag: Tags["AnnouncePresence"];
  sender: Uint8Array;
  lastSeens: readonly [Uint8Array, [bigint, number]][];
  schemaName: string;
  schemaVersion: bigint;
}>;

export type Changes = Readonly<{
  _tag: Tags["Changes"];
  sender: Uint8Array;
  since: readonly [bigint, number];
  changes: Readonly<Change[]>;
}>;

export type RejectChanges = Readonly<{
  _tag: Tags["RejectChanges"];
  whose: Uint8Array;
  since: readonly [bigint, number];
}>;

export type StartStreaming = Readonly<{
  _tag: Tags["StartStreaming"];
  since: readonly [bigint, number];
  excludeSites: readonly Uint8Array[];
  localOnly: boolean;
}>;
