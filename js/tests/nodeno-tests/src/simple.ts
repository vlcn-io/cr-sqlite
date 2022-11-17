import { wdbTests } from "@vlcn.io/xplat-tests";
import crsqlite from "@vlcn.io/crsqlite-allinone";

Object.entries(wdbTests).forEach((x) => {
  const tc = x[1];
  tc(
    () => crsqlite.open(),
    (p: boolean) => {
      if (!p) {
        throw new Error();
      }
    }
  );
});
