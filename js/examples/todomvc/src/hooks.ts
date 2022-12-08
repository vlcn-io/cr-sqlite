import { useEffect, useState } from "react";
import { Ctx } from "./ctx";

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

      ctx.db.execO<T>(query).then((data) => {
        if (!isMounted) {
          return;
        }
        setState({
          data,
          loading: false,
        });
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
