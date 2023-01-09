import dbFactory from "./db.js";
import { EstablishedConnection } from "./establishedConnection.js";
import logger from "./logger.js";
import {
  Config,
  decodeMsg,
  encodeMsg,
  EstablishConnectionMsg,
  Msg,
  Socket,
} from "@vlcn.io/client-server-common";
import { stringify as uuidStringify } from "uuid";
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
  #site?: Uint8Array;
  #establishedConnection?: EstablishedConnection;
  #establishPromise?: Promise<void>;
  #siteStr?: string;

  constructor(private readonly config: Config, private readonly ws: Socket) {
    ws.onclose = () => {
      logger.info("ws connection closed", {
        event: "Connection.closed",
        req: contextStore.get().reqId,
      });
      this.#closed();
    };

    ws.onmessage = this.#onMsg;
  }

  send(msg: Msg) {
    this.ws.send(encodeMsg(msg));
  }

  #onMsg = (data: ArrayBuffer) => {
    logger.info(`receive msg`, {
      event: "Connection.#onMsg",
      req: contextStore.get().reqId,
    });
    let decoded: null | Msg;
    try {
      decoded = decodeMsg(new Uint8Array(data as any));
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
    this.#siteStr = uuidStringify(msg.from);
    this.#establishPromise = dbFactory(this.config, msg.to, msg.create).then(
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

  get siteStr() {
    return this.#siteStr!;
  }

  close(code: ConnectionCodeKey, data?: Object) {
    logger.info("requested to close ws connection", {
      event: "Connection.close",
      req: contextStore.get().reqId,
    });
    this.ws.closeForError(
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
