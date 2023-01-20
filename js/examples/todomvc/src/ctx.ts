import { TblRx } from "@vlcn.io/rx-tbl";
import { DB } from "@vlcn.io/wa-crsqlite";
import startSync from "@vlcn.io/client-websocket";

export type Ctx = {
  db: DB;
  rx: TblRx;
  sync: Awaited<ReturnType<typeof startSync>>;
};
