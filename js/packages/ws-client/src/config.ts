import { Transport } from "./transport/Transport.js";
import { DB } from "./DB.js";

export default {
  dbProvider: (dbname: string): PromiseLike<DB> => {
    throw new Error(
      "You must configure a db provider. `config.dbProvider = yourProvider;`"
    );
  },

  transportProvider: <T>(dbname: string, transportOpts: T): Transport => {
    throw new Error(
      "You must configure a transport provider. `config.transportProvider = yourProvider;`"
    );
  },
};
