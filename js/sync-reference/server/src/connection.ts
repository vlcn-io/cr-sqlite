import { RawData, WebSocket } from "ws";
import establishedConnections from "./establishedConnections";
import logger from "./logger";
import { SiteIdWire } from "./protocol";

const connectionCode = {
  OK: 0,
  DUPLICATE_SITE: 1,
} as const;
type ConnectionCodeKey = keyof typeof connectionCode;

export class Connection {
  #site?: SiteIdWire;
  #establishedConnection?: EstablishedConnection;

  constructor(private readonly ws: WebSocket) {
    ws.on("close", () => {
      this.#closed();
    });

    ws.on("message", (data) => {
      logger.log("info", `Received messages ${data}`);
      if (this.#establishedConnection) {
        this.#establishedConnection.processMsg(data);
      } else {
        // if we got the right msg, establish
      }
    });
  }

  onClosed?: () => void;

  #established(site: SiteIdWire) {
    this.#site = site;
    this.#establishedConnection = new EstablishedConnection(this);
    establishedConnections.add(this.#establishedConnection);
  }

  get site() {
    return this.#site!;
  }

  close(code: ConnectionCodeKey, data?: string) {
    this.ws.close(connectionCode[code], data);
  }

  #closed() {
    this?.onClosed?.();
  }
}

export class EstablishedConnection {
  constructor(private readonly connection: Connection) {
    /**
     * We should ask client for `changes since` since we last saw them.
     */
  }

  get site(): SiteIdWire {
    return this.connection.site;
  }

  processMsg(data: RawData) {
    /**
     * Client will ask us for `changes since`
     * which will then kick off the stream
     */
  }

  close(code: ConnectionCodeKey, data?: string) {
    this.connection.close(code, data);
  }

  set onClosed(cb: () => void) {
    if (this.connection.onClosed) {
      throw new Error(
        "Trying to register onClosed on a connection that already has a listener"
      );
    }

    this.connection.onClosed = cb;
  }

  dbChanged() {
    // attempt to push to our connected site but keep track of backpressure and batch
    // items if it is too high.
    // We have to keep track of backpressure at the app level
    // due to: https://stackoverflow.com/questions/19414277/can-i-have-flow-control-on-my-websockets
    //
    // if backpressure gets too high, destroy the connection.
    // "too high" should be determined based on available ram and expected
    // concurrent connections.
    //
    // ideally we don't even buffer changesets.
  }
}

// connection pool we can notify of db change events
