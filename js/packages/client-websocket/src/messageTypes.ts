import { UpdateType } from "@vlcn.io/xplat-api";

export type Init = {
  _tag: "init";
  dbname: string;
  uri: string;
  remoteDbId: Uint8Array;
  create?: {
    schemaName: string;
  },
  accessToken?: string;
};

export type RequestSync = {
  _tag: "request_sync";
};

// The worker will listen for changes on its connection
// then, on the next microstask, ship them to the UI thread.
// on the next microtask so we can collect all of the changes in a single
// go and not spam the UI thread with a bunch of messages.
export type DBChange = {
  _tag: "db_change";
  collectedChanges: [
    UpdateType,
    string, // table name
    bigint // rowid
  ][];
};

export type Msg = Init | RequestSync | DBChange;
