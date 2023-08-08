import { DBID } from "../types";

export type Msg = StartSyncMsg | StopSyncMsg;

export type StartSyncMsg = {
  _tag: "StartSync";
  dbid: DBID;
  partyOpts: {
    host: string;
    room: string;
  };
};

export type StopSyncMsg = {
  _tag: "StopSync";
  dbid: DBID;
};
