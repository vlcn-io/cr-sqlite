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

import { DB, DBAsync, UpdateType } from "@vlcn.io/xplat-api";

export type Src = "thisProcess" | "otherProcess";

export class TblRx {
  #pointListeners = new Map<
    string,
    Map<bigint, ((updates: UpdateType[]) => void)[]>
  >();
  #rangeListeners = new Map<string, Set<(updates: UpdateType[]) => void>>();
  #arbitraryListeners = new Set<(updates: UpdateType[], src: Src) => void>();
  __internalRawListener: (updates: [UpdateType, string, bigint][]) => void =
    () => {};
  #disposeHook: () => void;

  // If a listener is subscribed to many events we'll collapse them into one
  // TODO: test that `onUpdate` is not spread across ticks of the event loop.

  #pendingNotification: [UpdateType, string, bigint][] | null = null;
  #bc: BroadcastChannel;

  constructor(private readonly db: DB | DBAsync) {
    this.#bc = new BroadcastChannel(db.siteid);
    this.#bc.onmessage = (msg) => {
      this.__internalNotifyListeners(msg.data, "otherProcess");
    };

    this.#disposeHook = this.db.onUpdate(
      (updateType, dbName, tblName, rowid) => {
        // Ignoring updates to internal tables.
        if (tblName.indexOf("__crsql") !== -1) {
          return;
        }
        this.#preNotify(updateType, tblName, rowid);
      }
    );
  }

  /**
   * Exposed to one connection (e.g., connection in web-workers)
   * to notify another connection about database changes.
   */
  __internalNotifyListeners(data: [UpdateType, string, bigint][], src: Src) {
    this.__internalRawListener(data);
    // toNotify map exists to de-dupe listeners.
    // If you register for many events you'll only get called once even if many
    // of those events fire.
    const toNotify = new Map<
      (updates: UpdateType[], src: Src) => void,
      UpdateType[]
    >();
    for (const [updateType, tbl, rowid] of data) {
      const cbList = this.#rangeListeners.get(tbl);
      if (cbList != null) {
        for (const cb of cbList) {
          let existing = toNotify.get(cb);
          if (existing == null) {
            existing = [];
            toNotify.set(cb, existing);
          }
          if (existing.indexOf(updateType) === -1) {
            existing.push(updateType);
          }
        }
      }

      const tblMap2 = this.#pointListeners.get(tbl);
      if (tblMap2 != null) {
        const cbList = tblMap2.get(rowid);
        if (cbList != null) {
          for (const cb of cbList) {
            let existing = toNotify.get(cb);
            if (existing == null) {
              existing = [];
              toNotify.set(cb, existing);
            }
            if (existing.indexOf(updateType) === -1) {
              existing.push(updateType);
            }
          }
        }
      }
    }

    for (const l of this.#arbitraryListeners) {
      toNotify.set(l, []);
    }

    for (const [cb, updates] of toNotify) {
      cb(updates, src);
    }
  }

  #preNotify(updateType: UpdateType, tbl: string, rowid: bigint) {
    if (this.#pendingNotification != null) {
      this.#pendingNotification.push([updateType, tbl, rowid]);
      return;
    }

    this.#pendingNotification = [];
    this.#pendingNotification.push([updateType, tbl, rowid]);
    setTimeout(() => {
      const data = this.#pendingNotification!;
      this.#pendingNotification = null;
      this.__internalNotifyListeners(data, "thisProcess");
      this.#bc.postMessage(data);
    }, 0);
  }

  onRange(tables: string[], cb: (updates: UpdateType[]) => void) {
    for (const tbl of tables) {
      let cbList = this.#rangeListeners.get(tbl);
      if (cbList == null) {
        cbList = new Set();
        this.#rangeListeners.set(tbl, cbList);
      }
      cbList.add(cb);
    }
    return () => {
      for (const tbl of tables) {
        const cbList = this.#rangeListeners.get(tbl);
        if (cbList != null) {
          cbList.delete(cb);
        }
      }
    };
  }

  onPoint(tbl: string, rowid: bigint, cb: (updates: UpdateType[]) => void) {
    let tblMap = this.#pointListeners.get(tbl);
    if (tblMap == null) {
      tblMap = new Map();
      this.#pointListeners.set(tbl, tblMap);
    }
    let cbList = tblMap.get(rowid);
    if (cbList == null) {
      cbList = [];
      tblMap.set(rowid, cbList);
    }
    cbList.push(cb);
    return () => {
      const tblMap = this.#pointListeners.get(tbl);
      if (tblMap != null) {
        const cbList = tblMap.get(rowid);
        if (cbList != null) {
          const idx = cbList.indexOf(cb);
          if (idx !== -1) {
            cbList.splice(idx, 1);
          }
          if (cbList.length === 0) {
            tblMap.delete(rowid);
          }
        }
      }
    };
  }

  onAny(cb: (updates: UpdateType[], src: Src) => void) {
    this.#arbitraryListeners.add(cb);
    return () => {
      this.#arbitraryListeners.delete(cb);
    };
  }

  dispose() {
    this.#rangeListeners.clear();
    this.#pointListeners.clear();
    this.#arbitraryListeners.clear();
    this.#bc.close();
    this.#disposeHook();
  }
}

export default function tblrx(db: DB | DBAsync) {
  return new TblRx(db);
}
