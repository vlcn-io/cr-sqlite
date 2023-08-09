import {
  Changes,
  bytesToHex,
  tags,
  greaterThanOrEqual,
} from "@vlcn.io/ws-common";
import { Transport } from "../transport/Transport";
import { DB } from "../DB";

/**
 * Represents a stream of changes coming into the local
 * database from one or more remote databases.
 */
export default class InboundStream {
  readonly #transport;
  readonly #db;
  /**
   * Used to ensure changes are applied in-order from all the peers
   * that are upstream of us.
   * While we do support out-of-order delivery it is more complicated
   * to track than just doing in-order delivery.
   *
   * We are doing a map here since the server could be ephemeral and multiplexing changes from
   * many peers rather than "store and forwarding" changes from peers.
   */
  readonly #lastSeens: Map<string, readonly [bigint, number]> = new Map();

  constructor(db: DB, transport: Transport) {
    this.#transport = transport;
    this.#db = db;
  }

  prepare(lastSeens: [Uint8Array, [bigint, number]][]) {
    for (const entry of lastSeens) {
      this.#lastSeens.set(bytesToHex(entry[0]), entry[1]);
    }
  }

  receiveChanges = async (msg: Changes) => {
    const senderHex = bytesToHex(msg.sender);
    const lastSeen = this.#lastSeens.get(senderHex) || [0n, 0];

    if (!greaterThanOrEqual(lastSeen, msg.since)) {
      this.#transport.rejectChanges({
        _tag: tags.RejectChanges,
        whose: msg.sender,
        since: lastSeen,
      });
      return;
    }

    if (msg.changes.length == 0) {
      return;
    }
    const lastChange = msg.changes[msg.changes.length - 1];
    const newLastSeen = [lastChange[5], 0] as const;
    this.#lastSeens.set(senderHex, newLastSeen);
    try {
      await this.#db.applyChangesetAndSetLastSeen(
        msg.changes,
        msg.sender,
        newLastSeen
      );
    } catch (e) {
      this.#lastSeens.set(senderHex, lastSeen);
      throw e;
    }
  };
}
