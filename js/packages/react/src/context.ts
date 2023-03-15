import { TblRx } from "@vlcn.io/rx-tbl";
import { DBAsync, DB } from "@vlcn.io/xplat-api";
import { createContext, useContext } from "react";

export type CtxAsync = {
  readonly db: DBAsync;
  readonly rx: TblRx;
};

export type Ctx = {
  readonly db: DB;
  readonly rx: TblRx;
};

export function createReactContext() {
  return createContext<CtxAsync | null>(null);
}

export const VlcnAsyncCtx = createReactContext();
