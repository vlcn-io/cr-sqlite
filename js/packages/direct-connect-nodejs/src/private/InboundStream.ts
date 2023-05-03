import {
  AckChangesMsg,
  StreamingChangesMsg,
} from "@vlcn.io/direct-connect-common";

/**
 * Takes the results of an outbound stream and
 * ingests them into a database.
 *
 * InboundStream differs from ApplyChanges in that it is stateful.
 *
 * ApplyChanges must look up seen_peers on every call to ensure the
 * changes can be applied (seqStart <= current retained seq).
 *
 * InboundStream would keep this state in-memory.
 *
 * For a server,
 * InboundStream would not work where the stream is not pinned to
 * a single server.
 *
 * This is because the underying DB state would change when other nodes
 * update it, causing the in-memory inbound stream to fall out of sync.
 */
export default class InboundStream {
  constructor() {}

  receiveChanges(changes: StreamingChangesMsg): AckChangesMsg {
    throw new Error();
  }
}
