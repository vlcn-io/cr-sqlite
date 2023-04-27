import { Config } from "./Types.js";
import path from "path";
import os from "os";
import fs from "fs";

const isDarwin = os.platform() === "darwin";
const ex = {
  getDbFilename(config: Config, dbid: string): string {
    return path.join(config.dbsDir, dbid + ".db");
  },

  getTouchFilename(config: Config, dbid: string): string {
    return path.join(config.dbsDir, dbid + ".touch");
  },

  fileEventNameToDbId(filename: string): string {
    return path.parse(filename).name;
  },

  isDarwin() {
    return isDarwin;
  },

  touchFile(config: Config, dbid: string): Promise<void> {
    if (!isDarwin) {
      throw new Error("Touch hack is only required for darwin");
    }
    return fs.promises
      .open(ex.getTouchFilename(config, dbid), "w")
      .then((fd) => {
        return fd.close();
      });
  },
};

export default ex;
