import * as Comlink from "comlink";
import comlinkable, {
  registerDbExtension,
  DBID,
} from "@vlcn.io/crsqlite-wasm/dist/comlinkable";
import tblrx from "@vlcn.io/rx-tbl";
import wdbRtc from "@vlcn.io/network-webrtc";
import { DB } from "@vlcn.io/crsqlite-wasm";

const rtcs = new Map<DBID, ReturnType<typeof wdbRtc>>();
const rxs = new Map<DBID, ReturnType<typeof tblrx>>();
registerDbExtension((dbid: DBID, db: DB) => {
  const rtc = wdbRtc(db);
  rtcs.set(dbid, rtc);
  return () => {
    rtcs.delete(dbid);
    rtc.dispose();
  };
});
registerDbExtension((dbid: DBID, db: DB) => {
  const rx = tblrx(db);
  rxs.set(dbid, rx);
  return () => {
    rxs.delete(dbid);
    rx.dispose();
  };
});

// TODO extend the comlinkable type
// TODO: simpler way to compose extensions to a comlinked interface
// can we just auto-convert these APIs to comlink compatible ones?
(comlinkable as any).onTblChange = (
  dbid: DBID,
  cb: (tbls: Set<string>) => void
): (() => void) => {
  const rx = rxs.get(dbid);
  return rx!.on(cb);
};

// TODO: test returned functions work as expected thru a comlink
(comlinkable as any).schemaChanged = (dbid: DBID) => {
  const rx = rxs.get(dbid);
  const rtc = rtcs.get(dbid);
  rx!.schemaChanged();
  rtc!.schemaChanged();
};

(comlinkable as any).onConnectionsChanged = (
  dbid: DBID,
  cb: (pending: string[], established: string[]) => void
) => {
  const rtc = rtcs.get(dbid);
  return rtc!.onConnectionsChanged(cb);
};

(comlinkable as any).connectTo = () => {};

Comlink.expose(comlinkable);
