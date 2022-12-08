import { RawData, WebSocket } from "ws";
import dbFactory from "./db.js";
import { EstablishedConnection } from "./establishedConnection.js";
import logger from "./logger.js";
import {
  EstablishConnectionMsg,
  Msg,
  SiteIdWire,
} from "@vlcn.io/client-server-common";
import contextStore from "./contextStore.js";

const connectionCode = {
  OK: 1000,
  DUPLICATE_SITE: 4001,
  DB_OPEN_FAIL: 4002,
  MSG_DECODE_FAILURE: 4003,
  INVALID_MSG_STATE: 4004,
  ERROR: 4005,
  OUT_OF_ORDER_DELIVERY: 4006,
} as const;
export type ConnectionCodeKey = keyof typeof connectionCode;

export class Connection {
  #site?: SiteIdWire;
  #establishedConnection?: EstablishedConnection;
  #establishPromise?: Promise<void>;

  constructor(private readonly ws: WebSocket) {
    ws.on("close", () => {
      logger.info("ws connection closed", {
        event: "Connection.closed",
        req: contextStore.get().reqId,
      });
      this.#closed();
    });

    ws.on("message", this.#onMsg);
  }

  send(msg: Msg) {
    this.ws.send(JSON.stringify(msg));
  }

  #onMsg = (data: RawData) => {
    logger.info(`receive msg`, {
      event: "Connection.#onMsg",
      req: contextStore.get().reqId,
    });
    let decoded: null | Msg;
    try {
      decoded = JSON.parse(data.toString()) as Msg;
    } catch (e) {
      logger.error("decode failure", {
        event: "Connection.#onMsg.decodeFailure",
        req: contextStore.get().reqId,
      });
      this.close("MSG_DECODE_FAILURE");
      return;
    }

    logger.info(`Processing ${decoded._tag} from ${this.site}`);

    if (this.#establishedConnection || this.#establishPromise) {
      if (decoded._tag == "establish") {
        logger.error(
          `Received establish message but connection is already established to ${
            this.#site
          }`
        );
        this.close("INVALID_MSG_STATE");
        return;
      }

      // Received message while awaiting establish completion
      if (!this.#establishedConnection) {
        logger.debug("Enqueue on establishPromise", {
          event: "Connection.#onMsg.enqueue",
          tag: decoded._tag,
          from: this.#site,
          req: contextStore.get().reqId,
        });
        this.#establishPromise!.then(() => {
          this.#onMsg(data);
        });
        return;
      }

      try {
        this.#establishedConnection!.processMsg(decoded);
      } catch (e: any) {
        logger.error("Closing", {
          event: "Conection.#onMsg.error",
          tag: decoded._tag,
          from: this.#site,
          req: contextStore.get().reqId,
          code: e.code,
          msg: e.message,
          stack: e.stack,
        });
        if (e.code) {
          this.close(e.code);
        } else {
          logger.error(e.message);
          this.close("ERROR");
        }
      }

      return;
    }

    if (decoded._tag != "establish") {
      logger.error(`Received msg but connection is not established`, {
        event: "Connection.#onMsg.invalidState",
        tag: decoded._tag,
        from: this.#site,
        req: contextStore.get().reqId,
      });
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
    logger.info(`upgrading to established connection`, {
      event: "Connection.#establish",
      from: msg.from,
      db: msg.to,
      req: contextStore.get().reqId,
    });

    this.#site = msg.from;
    this.#establishPromise = dbFactory(msg.to, msg.create).then(
      (db) => {
        this.#establishedConnection = new EstablishedConnection(this, db);
        this.#establishedConnection.processMsg({
          _tag: "request",
          seqStart: msg.seqStart,
        });
      },
      (e) => {
        logger.error(e.message);
        this.close("DB_OPEN_FAIL");
      }
    );
  }

  get site() {
    return this.#site!;
  }

  close(code: ConnectionCodeKey, data?: Object) {
    logger.info("requested to close ws connection", {
      event: "Connection.close",
      req: contextStore.get().reqId,
    });
    this.ws.close(
      connectionCode[code],
      data ? JSON.stringify(data) : undefined
    );
  }

  #closed() {
    this.ws.removeAllListeners();
    this.#establishedConnection = undefined;
    this.#establishPromise = undefined;
    this?.onClosed?.();
  }
}
