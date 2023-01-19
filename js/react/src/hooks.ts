import { useEffect, useState } from "react";
import { TblRx } from "@vlcn.io/rx-tbl";
import { DB, DBAsync } from "@vlcn.io/xplat-api";

export type QueryData<T> = {
  loading: boolean;
  error?: Error;
  data: T[];
};

export type Ctx = {
  db: DB | DBAsync;
  rx: TblRx;
};

// TODO: two useQuery variants?
// ony for async db and one for sync db?

// export function useQuery<T extends {}>(
//   ctx: Ctx,
//   query: string,
//   bindings?: []
// ): QueryData<T> {
//   const [state, setState] = useState<QueryData<T>>({
//     data: [],
//     loading: true,
//   });
//   useEffect(() => {
//     let isMounted = true;
//     const runQuery = (changedTbls: Set<string> | null) => {
//       if (!isMounted) {
//         return;
//       }

//       // TODO: determine tables by:
//       // 1. preparing the query
//       // 2. calling `used_tables` on the prepared statement
//       if (changedTbls != null) {
//         if (!tables.some((t) => changedTbls.has(t))) {
//           return;
//         }
//       }

//       ctx.db.execO<T>(query).then((data) => {
//         if (!isMounted) {
//           return;
//         }
//         setState({
//           data,
//           loading: false,
//         });
//       });
//     };

//     const disposer = ctx.rx.on(runQuery);

//     // initial kickoff to get initial data.
//     runQuery(null);

//     return () => {
//       isMounted = false;
//       disposer();
//     };
//   }, [query, ...(bindings || [])]);

//   return state;
// }
