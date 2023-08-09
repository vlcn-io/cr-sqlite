import { Change } from "@vlcn.io/ws-common";

export interface DB {
  readonly siteid: Uint8Array;
  pullChangeset(
    since: readonly [bigint, number],
    excludeSites: readonly Uint8Array[],
    localOnly: boolean
  ): PromiseLike<readonly Change[]>;
  applyChangesetAndSetLastSeen(
    changes: readonly Change[],
    siteId: Uint8Array,
    end: readonly [bigint, number]
  ): PromiseLike<void>;

  getLastSeens(): PromiseLike<[Uint8Array, [bigint, number]][]>;
  getSchemaNameAndVersion(): PromiseLike<[string, bigint]>;

  /**
   * Allow the sync layer to observe when the database changes as a result
   * of non-sync events.
   */
  onChange(cb: () => void): () => void;

  close(closeWrappedDB: boolean): void;
}
