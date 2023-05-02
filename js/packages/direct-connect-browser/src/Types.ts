export type Endpoints = {
  getChanges: string;
  applyChanges: string;
  establishOutboundStream: string;
  getLastSeen: string;
};

export type Msg =
  | LocalDBChangedMsg
  | SyncedRemoteMsg
  | StartSyncMsg
  | StopSyncMsg;

export type LocalDBChangedMsg = {
  _tag: "LocalDBChanged";
  dbid: string;
};

export type SyncedRemoteMsg = {
  _tag: "SyncedRemote";
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
