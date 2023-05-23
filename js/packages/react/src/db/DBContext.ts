import { CtxAsync } from "../context.js";
import React from "react";

export function createContext() {
  const DBContext = React.createContext<CtxAsync | null>(null);
  DBContext.displayName = "DBContext";
  function useDb() {
    return React.useContext<CtxAsync | null>(DBContext);
  }
  return { DBContext, useDb };
}
