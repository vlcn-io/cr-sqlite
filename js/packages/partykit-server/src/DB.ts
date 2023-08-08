// If it is a completely new db we need to apply the schema to it...
export default class DB {
  constructor(name: string) {
    // TODO: different rooms may need different DB schemas.
    // We should support some way of defining this.
  }

  getLastSeen(site: Uint8Array): [bigint, number] {
    return [0n, 0];
  }

  schemasMatch(schemaName: string, schemaVersion: bigint): boolean {
    return true;
  }

  /**
   * A trivial `onChange` implementation.
   *
   * Our other server implementations support geo-distributed strongly consistent replication of the DB **and** change
   * notification.
   *
   * This here only supports monitoring changes to a DB that are made through the same instance
   * of this class. Given all connections share the same DB instance, via DBCache, this works for now.
   *
   * @param cb
   */
  onChange(cb: () => void) {}

  close() {
    this.#diposer();
  }
}
