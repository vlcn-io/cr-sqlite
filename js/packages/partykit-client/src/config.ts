import { Change } from "@vlcn.io/partykit-common";
import { Transport } from "./transport/Transport";

export interface DB {
  readonly siteid: Uint8Array;
  pullChangeset(
    since: [bigint, number],
    excludeSites: Uint8Array[],
    localOnly: boolean
  ): PromiseLike<readonly Change[]>;
  applyChangesetAndSetLastSeen(
    changes: readonly Change[],
    setId: Uint8Array,
    end: [bigint, number]
  ): PromiseLike<void>;

  getLastSeens(): PromiseLike<[Uint8Array, [bigint, number]][]>;
  getSchemaNameAndVersion(): PromiseLike<[string, bigint]>;

  /**
   * Allow the sync layer to observe when the database changes as a result
   * of non-sync events.
   */
  onChange(cb: () => void): () => void;
}

export default {
  dbProvider: (dbname: string): PromiseLike<DB> => {
    throw new Error(
      "You must configure a db provider. `config.dbProvider = yourProvider;`"
    );
  },

  transportProvider: <T>(dbname: string, transportOpts: T): Transport => {
    throw new Error(
      "You must configure a transport provider. `config.transportProvider = yourProvider;`"
    );
  },
};
