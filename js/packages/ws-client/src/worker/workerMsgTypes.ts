import { Config } from "../config";
import { TransporOptions } from "../transport/Transport";
import { DBID } from "../types";

export type Msg = StartSyncMsg | StopSyncMsg | ConfigureMsg;

export type StartSyncMsg = {
  _tag: "StartSync";
  dbid: DBID;
  transportOpts: TransporOptions;
};

export type StopSyncMsg = {
  _tag: "StopSync";
  dbid: DBID;
};

export type ConfigureMsg = {
  _tag: "Configure";
  configModule: string;
};
