// After an `establishedConnection` has received a `requestChanges` event
// we start a change stream for that client.

import { DBType } from "./db.js";
import { EstablishedConnection } from "./establishedConnection.js";
import logger from "./logger.js";
import { ChangesAckedMsg, ChangesRequestedMsg } from "./protocol.js";

// change stream:
// 1. sends the requested changes up till now
// 2. records `endSeq`
// 3. sends from `endSeq` till now on db change events not caused by the client
// pulling changesets filters against the client's id

export default class ChangeStream {
  #begun: boolean = false;
  constructor(
    private readonly db: DBType,
    private readonly connection: EstablishedConnection
  ) {
    connection.onClosed = this.#connClosed;
  }

  begin(msg: ChangesRequestedMsg) {
    if (this.#begun) {
      logger.error(`Change stream to ${this.db.siteId} was already started`);
      throw {
        code: "INVALID_MSG_STATE",
      };
    }

    this.#begun = true;
  }

  processAck(msg: ChangesAckedMsg) {}

  #connClosed = () => {};
}
