import TX from "./TX.js";
import { Mutex } from "async-mutex";
import { DBAsync, TMutex, TXAsync } from "@vlcn.io/xplat-api";
import log from "./log.js";

/**
 * Although wa-sqlite exposes an async interface, hitting
 * it concurrently deadlocks it.
 *
 * It is only to be used sequentially.
 *
 * Serialize enforces that, nomatter what the callers of us do.
 *
 * null clears cache. Use for writes.
 * string gets from cache.
 * undefined has no impact on cache and does not check cache.
 */
export const topLevelMutex = new Mutex();
(topLevelMutex as any).name = "topLevelMutex";

export function serialize(
  cache: Map<string, Promise<any>> | null,
  key: string | null | undefined,
  cb: () => any,
  mutex: TMutex
) {
  // if is write, drop cache and don't use cache
  // TODO: test me. Useful for Strut where all slides query against deck and such things.
  // TODO: when we no longer have to serialize calls we should use `graphql/DataLoader` infra
  if (key === null) {
    log("Cache clear");
    cache?.clear();
  } else if (key !== undefined) {
    const existing = cache?.get(key);
    if (existing) {
      log("Cache hit", key);
      return existing;
    }
  }

  log("Enqueueing query ", key);

  let cause: Error | null = null;
  if ((import.meta as any).env?.DEV) {
    cause = new Error();
  }

  const res = mutex.runExclusive(cb);
  // console.log('Running ', key);

  if (key) {
    cache?.set(key, res);
    res
      .finally(() => cache?.delete(key))
      .catch((e) => {
        console.error(e);
        if (cause) {
          console.error("Caused by", cause);
        }
        // this catch doesn't swallow, the exception still makes it to the user
        // of res as we return res rather than the caught variation of res.
      });
  }

  return res;
}

export function serializeTx(cb: (db: TXAsync) => any, mutex: Mutex, db: TX) {
  return mutex.runExclusive(() => {
    const subMutex = new Mutex();
    const tx = new TX(db.api, db.db, subMutex, db.assertOpen, db.stmtFinalizer);
    return cb(tx);
  });
}
