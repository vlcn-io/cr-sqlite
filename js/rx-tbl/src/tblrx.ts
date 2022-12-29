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

import { DB, DBAsync } from "@vlcn.io/xplat-api";

export class TblRx {
  #listeners = new Set<(tbls: Map<string, Set<bigint>>) => void>();
  #pendingNotification: Map<string, Set<bigint>> | null = null;
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
      this.#preNotify(tblName, rowid);
    });
  }

  #notifyListeners(notif: Map<string, Set<bigint>>) {
    for (const l of this.#listeners) {
      try {
        // one listener shouldn't kill all others.
        // e.g., like one thread death doesn't kill all other threads.
        l(notif);
      } catch (e) {
        console.error(e);
      }
    }
  }

  #preNotify(tbl: string, rowid: bigint) {
    if (this.#pendingNotification != null) {
      let existing = this.#pendingNotification.get(tbl);
      if (existing == null) {
        existing = new Set();
        this.#pendingNotification.set(tbl, existing);
      }
      existing.add(BigInt(rowid));
      return;
    }

    this.#pendingNotification = new Map();
    this.#pendingNotification.set(tbl, new Set([rowid]));
    queueMicrotask(() => {
      const notif = this.#pendingNotification!;
      this.#pendingNotification = null;
      this.#notifyListeners(notif);
      this.#bc.postMessage(notif);
    });
  }

  on(cb: (tbls: Map<string, Set<bigint>>) => void) {
    this.#listeners.add(cb);
    return () => {
      this.off(cb);
    };
  }

  off(cb: (tbls: Map<string, Set<bigint>>) => void) {
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
