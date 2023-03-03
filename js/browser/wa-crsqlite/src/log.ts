const isDebug = (globalThis as any).__vlcn_wa_crsqlite_dbg;
export default function log(...data: any[]) {
  if (isDebug) {
    console.log("wa-crsqlite: ", ...data);
  }
}
