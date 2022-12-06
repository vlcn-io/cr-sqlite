import { RawData, WebSocket } from "ws";
import dbFactory from "./db.js";
import { EstablishedConnection } from "./establishedConnection.js";
import logger from "./logger.js";
import {
  ChangesAckedMsg,
  ChangesReceivedMsg,
  ChangesRequestedMsg,
  EstablishConnectionMsg,
  Msg,
  SiteIdWire,
  Version,
} from "./protocol.js";

const connectionCode = {
  OK: 0,
  DUPLICATE_SITE: 1,
  DB_OPEN_FAIL: 2,
  MSG_DECODE_FAILURE: 3,
  INVALID_MSG_STATE: 4,
  ERROR: 5,
  OUT_OF_ORDER_DELIVERY: 6,
} as const;
export type ConnectionCodeKey = keyof typeof connectionCode;

export class Connection {
  #site?: SiteIdWire;
  #establishedConnection?: EstablishedConnection;

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
      this.close("MSG_DECODE_FAILURE");
      return;
    }

    if (this.#establishedConnection) {
      if (decoded._tag == "establish") {
        this.close("INVALID_MSG_STATE");
        return;
      }

      try {
        this.#establishedConnection.processMsg(decoded);
      } catch (e: any) {
        if (e.code) {
          this.close(e.code);
        } else {
          this.close("ERROR");
        }
      }

      return;
    }

    if (decoded._tag != "establish") {
      this.close("INVALID_MSG_STATE");
      return;
    }

    try {
      logger.log("info", `esatblishing connection to db ${decoded.to}`);
      this.#establish(decoded);
    } catch (e) {
      this.close("DB_OPEN_FAIL");
    }
  };

  onClosed?: () => void;

  #establish(msg: EstablishConnectionMsg) {
    this.#site = msg.from;
    dbFactory(msg.to, msg.create)
      .then((db) => {
        this.#establishedConnection = new EstablishedConnection(this, db);
        this.#establishedConnection.processMsg({
          _tag: "request",
          seqStart: msg.seqStart,
        });
      })
      .catch((e) => {
        this.close("DB_OPEN_FAIL");
      });
  }

  get site() {
    return this.#site!;
  }

  close(code: ConnectionCodeKey, data?: string) {
    this.ws.close(connectionCode[code], data);
  }

  #closed() {
    this.ws.removeAllListeners();
    this.#establishedConnection = undefined;
    this?.onClosed?.();
  }
}
