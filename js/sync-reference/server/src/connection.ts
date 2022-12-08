import { RawData, WebSocket } from "ws";
import dbFactory from "./db.js";
import { EstablishedConnection } from "./establishedConnection.js";
import logger from "./logger.js";
import {
  EstablishConnectionMsg,
  Msg,
  SiteIdWire,
} from "@vlcn.io/client-server-common";

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
      this.#closed();
    });

    ws.on("message", this.#onMsg);
  }

  send(msg: Msg) {
    this.ws.send(msg);
  }

  #onMsg = (data: RawData) => {
    logger.log("info", `Received message`);
    let decoded: null | Msg;
    try {
      decoded = JSON.parse(data.toString()) as Msg;
    } catch (e) {
      logger.error(`Could not decode message from ${this.#site}`);
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
        logger.debug(
          `Enqueue on establishPromise for ${decoded._tag} from ${this.#site}`
        );
        this.#establishPromise!.then(() => {
          this.#onMsg(data);
        });
        return;
      }

      try {
        this.#establishedConnection!.processMsg(decoded);
      } catch (e: any) {
        if (e.code) {
          logger.error(`Closing with code: ${e.code} to ${this.#site}`);
          this.close(e.code);
        } else {
          logger.error(e.message);
          this.close("ERROR");
        }
      }

      return;
    }

    if (decoded._tag != "establish") {
      logger.error(
        `Received ${decoded._tag} msg but connection is not established`
      );
      this.close("INVALID_MSG_STATE");
      return;
    }

    try {
      logger.info(
        `esatblishing connection to db ${decoded.to} from site ${decoded.from}`
      );
      this.#establish(decoded);
    } catch (e) {
      this.close("DB_OPEN_FAIL");
    }
  };

  onClosed?: () => void;

  #establish(msg: EstablishConnectionMsg) {
    this.#site = msg.from;
    this.#establishPromise = dbFactory(msg.to, msg.create)
      .then((db) => {
        this.#establishedConnection = new EstablishedConnection(this, db);
        this.#establishedConnection.processMsg({
          _tag: "request",
          seqStart: msg.seqStart,
        });
      })
      .catch((e) => {
        logger.error(e.message);
        this.close("DB_OPEN_FAIL");
      });
  }

  get site() {
    return this.#site!;
  }

  close(code: ConnectionCodeKey, data?: Object) {
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
