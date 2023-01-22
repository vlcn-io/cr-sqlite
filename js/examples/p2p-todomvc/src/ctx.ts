import { wdbRtc } from "@vlcn.io/sync-p2p";
import tblrx from "@vlcn.io/rx-tbl";
import { DB } from "@vlcn.io/wa-crsqlite";

export type Ctx = {
  db: DB;
  siteid: string;
  rtc: Awaited<ReturnType<typeof wdbRtc>>;
  rx: Awaited<ReturnType<typeof tblrx>>;
};
