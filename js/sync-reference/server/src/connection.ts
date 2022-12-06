import { RawData, WebSocket } from "ws";
import dbFactory, { DB } from "./db.js";
import logger from "./logger.js";
import { EstablishConnectionMsg, Msg, SiteIdWire } from "./protocol.js";

const connectionCode = {
  OK: 0,
  DUPLICATE_SITE: 1,
  DB_OPEN_FAIL: 2,
  MSG_DECODE_FAILURE: 3,
  INVALID_MSG_STATE: 4,
} as const;
type ConnectionCodeKey = keyof typeof connectionCode;

export class Connection {
  #site?: SiteIdWire;
  #establishedConnection?: EstablishedConnection;

  constructor(private readonly ws: WebSocket) {
    ws.on("close", () => {
      this.#closed();
    });

    ws.on("message", this.#onMsg);
  }

  #onMsg = (data: RawData) => {
    logger.log("info", `Received message`);
    let decoded: null | Msg;
    try {
      decoded = JSON.parse(data.toString()) as Msg;
    } catch (e) {
      this.close("MSG_DECODE_FAILURE");
      return;
    }

    if (this.#establishedConnection) {
      if (decoded._tag == "e") {
        this.close("INVALID_MSG_STATE");
        return;
      }
      this.#establishedConnection.processMsg(decoded);
      return;
    }

    if (decoded._tag != "e") {
      this.close("INVALID_MSG_STATE");
      return;
    }

    try {
      this.#establish(decoded);
    } catch (e) {
      this.close("DB_OPEN_FAIL");
    }
  };

  onClosed?: () => void;

  #establish(msg: EstablishConnectionMsg) {
    this.#site = msg.from;
    this.#establishedConnection = new EstablishedConnection(
      this,
      dbFactory(msg.to)
    );
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
  constructor(
    private readonly connection: Connection,
    private readonly db: DB
  ) {
    /**
     * We should ask client for `changes since` since we last saw them.
     */
  }

  get site(): SiteIdWire {
    return this.connection.site;
  }

  processMsg(data: Msg) {
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
