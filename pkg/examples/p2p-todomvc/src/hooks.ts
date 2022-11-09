import "./worker/dbapi-ext.js";
import { useEffect, useState } from "react";
import { DB } from "@vlcn.io/crsqlite-wasm";
import wdbRtc from "@vlcn.io/network-webrtc";
import tblrx from "@vlcn.io/rx-tbl";

export type Ctx = {
  db: DB;
  siteid: string;
  rtc: ReturnType<typeof wdbRtc>;
  rx: ReturnType<typeof tblrx>;
};

type QueryData<T> = {
  loading: boolean;
  error?: Error;
  data: T[];
};

export function useQuery<T extends {}>(
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

      setState({
        data: ctx.db.execO<T>(query),
        loading: false,
      });
    };

    const disposer = ctx.rx.on(runQuery);

    // initial kickoff to get initial data.
    runQuery(null);

    return () => {
      isMounted = false;
      disposer();
    };
  }, [query, ...(bindings || [])]);

  return state;
}
