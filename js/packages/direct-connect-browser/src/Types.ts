import { UpdateType, DBID } from "@vlcn.io/xplat-api";

export type Endpoints = {
  createOrMigrate: string;
  getChanges?: string;
  applyChanges: string;
  startOutboundStream: string;
  getLastSeen?: string;
};

export type ToWorkerMsg = StartSyncMsg | StopSyncMsg;
export type FromWorkerMsg = SyncedRemoteMsg;
export type Port = {
  postMessage: (msg: any) => void;
};

export type StartSyncMsg = {
  _tag: "StartSync";
  wasmUri?: string;
  dbid: DBID;
  endpoints: Endpoints;
  transportContentType: "application/json" | "application/octet-stream";
};

export type StopSyncMsg = {
  _tag: "StopSync";
  dbid: DBID;
};

export type SyncedRemoteMsg = {
  _tag: "SyncedRemote";
  dbid: DBID;
  collectedChanges: [UpdateType, string, bigint][];
};

export function newDbid() {
  return crypto.randomUUID().replaceAll("-", "") as DBID;
}
