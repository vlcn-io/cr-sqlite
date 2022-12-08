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
 *
 * The main thing this class does is to collapse all
 * calls from SQLite into one single call so our app
 * doesn't get hammered by large inserts or updates.
 */

// exist (select 1 from pragma_function_list where name = 'crsql_tbl_rx')

import { DB, DBAsync } from "@vlcn.io/xplat-api";

export class TblRx {
  #listeners = new Set<(tbls: Set<string>) => void>();
  #pendingNotification: Set<string> | null = null;
  #bc = new BroadcastChannel("@vlcn.io/rx-tbl");

  constructor(private readonly db: DB | DBAsync) {
    this.#bc.onmessage = (msg) => {
      this.#notifyListeners(msg.data);
    };

    this.db.onUpdate((updateType, dbName, tblName, rowid) => {
      // Ignoring updates to internal tables.
      if (tblName.indexOf("__crsql") !== -1) {
        return;
      }
      this.#preNotify(tblName);
    });
  }

  #notifyListeners(tbls: Set<string>) {
    for (const l of this.#listeners) {
      try {
        // one listener shouldn't kill all others.
        // e.g., like one thread death doesn't kill all other threads.
        l(tbls);
      } catch (e) {
        console.error(e);
      }
    }
  }

  #preNotify(tbl: string) {
    if (this.#pendingNotification != null) {
      this.#pendingNotification.add(tbl);
      return;
    }

    this.#pendingNotification = new Set();
    this.#pendingNotification.add(tbl);
    queueMicrotask(() => {
      const tbls = this.#pendingNotification!;
      this.#pendingNotification = null;
      this.#notifyListeners(tbls);
      this.#bc.postMessage(tbls);
    });
  }

  on(cb: (tbls: Set<string>) => void) {
    this.#listeners.add(cb);
    return () => {
      this.off(cb);
    };
  }

  off(cb: (tbls: Set<string>) => void) {
    this.#listeners.delete(cb);
  }

  dispose() {
    this.#listeners.clear();
    this.#bc.close();

    // This isn't the most convenient thing that it closes the db
    // but.. we can't deregister our update callback at the moment.
    // `close` on the db should be made idempotent
    this.db.close();
  }
}

export default function tblrx(db: DB | DBAsync) {
  return new TblRx(db);
}
