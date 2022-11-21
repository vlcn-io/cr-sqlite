/**
 * Dumb reactivity -- just watches tables and notifies when those tables change.
 *
 * Smarter reactivity will start to track data flow and react at the row level.
 *
 * We likely want to do "smart reactivity" in the ORM against currently loaded
 * data and subscribed queries such that we never have to hit the DB.
 *
 * Exception are events caused by data sync. Although the network layer could touch the ORM
 * for these cases.
 */

// exist (select 1 from pragma_function_list where name = 'crsql_tbl_rx')

import { DB, DBAsync } from "@vlcn.io/xplat-api";

const DOES_EXTENSION_EXIST =
  "SELECT 1 FROM pragma_function_list WHERE name = 'crsql_tblrx'";

export default async function tblrx(
  db: DB | DBAsync,
  ignoreTables: string[] = []
) {
  const bc = new BroadcastChannel("@vlcn.io/rx-tbl");
  bc.onmessage = (msg) => {
    notifyListeners(msg.data);
  };
  // TODO: should listeners not just be weak refs?
  const listeners = new Set<(tbls: Set<string>) => void>();

  const exists = await db.execA(DOES_EXTENSION_EXIST);
  if (exists.length == 0) {
    db.createFunction("crsql_tblrx", (tbl: string) => {
      preNotify(tbl);
    });
  }

  let pendingNotification: Set<string> | null = null;
  function preNotify(tbl: string) {
    if (pendingNotification != null) {
      pendingNotification.add(tbl);
      return;
    }

    pendingNotification = new Set();
    pendingNotification.add(tbl);
    queueMicrotask(() => {
      const tbls = pendingNotification!;
      pendingNotification = null;
      notifyListeners(tbls);
      bc.postMessage(tbls);
    });
  }

  function notifyListeners(tbls: Set<string>) {
    for (const l of listeners) {
      try {
        // one listener shouldn't kill all others.
        // e.g., like one thread death doesn't kill all other threads.
        l(tbls);
      } catch (e) {
        console.error(e);
      }
    }
  }

  let watching: string[] = [];
  const ret = {
    async schemaChanged() {
      // reinstall
      const toWatch = await db.execA<string[]>(
        `SELECT name FROM sqlite_master WHERE name NOT LIKE '%__crsql%' AND type = 'table' AND name NOT IN (${ignoreTables
          .map((t) => `'${t}'`)
          .join("\n")})`
      );

      watching = await Promise.all(
        toWatch.map(async (row) => {
          const tblName = row[0];
          await Promise.all(
            ["INSERT", "UPDATE", "DELETE"].map(async (verb) => {
              return await db.exec(
                `CREATE TEMP TRIGGER IF NOT EXISTS "${tblName}__crsql_tblrx_${verb.toLowerCase()}" AFTER ${verb} ON "${tblName}"
            BEGIN
              SELECT crsql_tblrx('${tblName}');
            END;
          `
              );
            })
          );

          return tblName;
        })
      );
    },

    get watching(): readonly string[] {
      return watching;
    },

    async dispose() {
      await Promise.all(
        watching.map(async (tbl) => {
          await Promise.all(
            ["INSERT", "UPDATE", "DELETE"].map(
              async (verb) =>
                await db.exec(
                  `DROP TRIGGER IF EXISTS "${tbl}__crsql_tblrx_${verb.toLowerCase()}";`
                )
            )
          );
        })
      );
      listeners.clear();
      bc.close();
    },

    on(cb: (tbls: Set<string>) => void) {
      listeners.add(cb);
      return () => {
        ret.off(cb);
      };
    },

    off(cb: (tbls: Set<string>) => void) {
      listeners.delete(cb);
    },
  } as const;

  await ret.schemaChanged();

  return ret;
}
