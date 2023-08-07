export type Msg = ChangesAvailable | ChangesRequested | Changes;

export const tags = {
  ChangesAvailable: 1,
  ChangesRequested: 2,
  Changes: 3,
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

export type ChangesAvailable = Readonly<{
  _tag: Tags["ChangesAvailable"];
  // The site that has the changes
  siteId: Uint8Array;
  // The latest DB version at that site
  until: [bigint, number];
  schemaVersion: bigint;
}>;

export type ChangesRequested = Readonly<{
  _tag: Tags["ChangesRequested"];
  // Who is requesting changes
  requestor: Uint8Array;
  // From which site are they requesting them
  siteId: Uint8Array;
  // Starting at which db version?
  since: [bigint, number];
  schemaVersion: bigint;
}>;

export type Changes = Readonly<{
  _tag: Tags["Changes"];
  sender: Uint8Array;
  receiver: Uint8Array;
  since: [bigint, number];
  until: [bigint, number];
  changes: Change[];
  schemaVersion: bigint;
}>;

export interface Transport {
  announcePresence(siteId: Uint8Array): PromiseLike<[bigint, number]>;
}
