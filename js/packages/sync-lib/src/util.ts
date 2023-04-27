import { Config } from "./Types.js";
import path from "path";

export default {
  getDbFilename(config: Config, dbid: string): string {
    return path.join(config.dbsDir, dbid + ".db");
  },

  fileEventNameToDbId(filename: string): string {
    return path.parse(filename).name;
  },
};
