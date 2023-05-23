/**
 * Constructs the MetaDB and provides it to children.
 *
 * Suspensy?
 */
import react, { useEffect, useRef, useState } from "react";
import { createContext } from "./DBContext.js";
import dbFactory, { Schema, DBID, SyncEdnpoints } from "./DBFactory.js";
import { CtxAsync } from "../context.js";

export default function DBProvider({
  dbid,
  children,
  schema,
  endpoints,
}: {
  dbid: DBID;
  schema: Schema;
  children: react.ReactNode;
  endpoints: SyncEdnpoints;
}) {
  const contextRef = useRef(createContext());
  const [dbRef, setDbRef] = useState<CtxAsync | null>(null);
  useEffect(() => {
    dbFactory
      .get(dbid, schema, endpoints, contextRef.current.useDb)
      .then((db) => {
        setDbRef(db);
      });
    return () => {
      dbFactory.closeAndRemove(dbid);
    };
  }, [dbid, schema, contextRef.current.useDb]);
  if (dbRef === null) {
    return <div>Creating DB {dbid}</div>;
  }
  return (
    <DbAvailable ctx={dbRef} DBContext={contextRef.current.DBContext}>
      {children}
    </DbAvailable>
  );
}

function DbAvailable({
  children,
  ctx,
  DBContext,
}: {
  children: react.ReactNode;
  ctx: CtxAsync;
  DBContext: React.Context<CtxAsync | null>;
}) {
  return <DBContext.Provider value={ctx}>{children}</DBContext.Provider>;
}
