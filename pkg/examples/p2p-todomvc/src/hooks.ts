import * as Comlink from "comlink";
import { ComlinkableAPI } from "@vlcn.io/crsqlite-wasm/dist/comlinkable";
import "./dbapi-ext.js";
import { useEffect, useState } from "react";

export type Ctx = {
  dbid: number;
  sqlite: Comlink.Remote<ComlinkableAPI>;
  siteid: string;
};

type QueryData<T> = {
  loading: boolean;
  error?: Error;
  data: T[];
};

export function useQuery<T>(
  ctx: Ctx,
  tables: string[],
  query: string,
  bindings?: []
): QueryData<T> {
  const [state, setState] = useState<QueryData<T>>({
    data: [],
    loading: true,
  });
  useEffect(() => {
    let isMounted = true;
    const runQuery = (changedTbls: Set<string> | null) => {
      if (!isMounted) {
        return;
      }

      if (changedTbls != null) {
        if (!tables.some((t) => changedTbls.has(t))) {
          return;
        }
      }

      ctx.sqlite.execO(ctx.dbid, query).then(
        (r) => {
          setState({
            data: r as any,
            loading: false,
          });
        },
        (e) => {
          setState((p) => ({
            error: e,
            data: p.data,
            loading: false,
          }));
        }
      );
    };

    const proxy = Comlink.proxy(runQuery);
    ctx.sqlite.onTblChange(ctx.dbid, proxy);

    // initial kickoff to get initial data.
    runQuery(null);

    return () => {
      isMounted = false;
      ctx.sqlite.offTblChange(ctx.dbid, proxy);
    };
  }, [query, ...(bindings || [])]);

  return state;
}
