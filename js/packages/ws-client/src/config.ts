import { Transport } from "./transport/Transport.js";
import { DB } from "./DB.js";
import { TransporOptions } from "./transport/Transport.js";
import WebSocketTransport from "./transport/WebSocketTransport.js";

export type Config = {
  dbProvider: (dbname: string) => PromiseLike<DB>;
  transportProvider: (transportOpts: TransporOptions) => Transport;
};

export const defaultConfig: Config = Object.freeze({
  dbProvider: (dbname: string): PromiseLike<DB> => {
    throw new Error(
      "You must configure a db provider. `config.dbProvider = yourProvider;`"
    );
  },

  transportProvider: <T>(transportOpts: TransporOptions): Transport => {
    return new WebSocketTransport(transportOpts);
  },
});
