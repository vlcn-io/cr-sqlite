import dbFactory, { DBID } from "./DBFactory.js";
import { CtxAsync } from "../context.js";

export default function useDB(dbid: DBID): CtxAsync {
  return dbFactory.getHook(dbid)!()!;
}
