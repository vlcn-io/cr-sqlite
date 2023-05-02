import { UpdateType } from "@vlcn.io/xplat-api";

export type Endpoints = {
  getChanges: URL;
  applyChanges: URL;
  establishOutboundStream: URL;
  getLastSeen: URL;
};

export type ToWorkerMsg = LocalDBChangedMsg | StartSyncMsg | StopSyncMsg;
export type FromWorkerMsg = SyncedRemoteMsg;

export type LocalDBChangedMsg = {
  _tag: "LocalDBChanged";
  dbid: string;
};

export type StartSyncMsg = {
  _tag: "StartSync";
  dbid: string;
  endpoints: Endpoints;
};

export type StopSyncMsg = {
  _tag: "StopSync";
  dbid: string;
};

export type SyncedRemoteMsg = {
  _tag: "SyncedRemote";
  dbid: string;
  collectedChanges: [UpdateType, string, bigint][];
};

type DBID = string & {
  readonly DBID: unique symbol; // this is the phantom type
};

export function newDbid() {
  return crypto.randomUUID().replaceAll("-", "") as DBID;
}
