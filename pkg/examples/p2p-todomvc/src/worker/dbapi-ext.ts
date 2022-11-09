import "@vlcn.io/crsqlite-wasm/dist/comlinkable";

declare module "@vlcn.io/crsqlite-wasm/dist/comlinkable" {
  export interface ComlinkableAPI {
    onTblChange(dbid: DBID, cb: (tbls: Set<string>) => void): void;
    offTblChange(dbid: DBID, cb: (tbls: Set<string>) => void): void;
    schemaChanged(dbid: DBID): void;
    onConnectionsChanged(
      dbid: DBID,
      cb: (pending: string[], established: string[]) => void
    ): void;
    offConnectionsChanged(
      dbid: DBID,
      cb: (pending: string[], established: string[]) => void
    ): void;
    connectTo(dbid: DBID, other: string): void;
  }
}
