import { Config } from "../Types.js";
import path from "path";
import os from "os";
import fs from "fs";
import { bytesToHex } from "@vlcn.io/direct-connect-common";

const needsTouchHack = os.platform() === "darwin" || os.platform() === "win32";
const ex = {
  getDbFilename(config: Config, dbid: Uint8Array): string {
    const ret = path.join(config.dbsDir, bytesToHex(dbid) + ".db");
    if (ret === config.serviceDbPath) {
      throw new Error("Service dbid is reserved");
    }
    return ret;
  },

  getTouchFilename(config: Config, dbid: Uint8Array): string {
    return path.join(config.dbsDir, bytesToHex(dbid) + ".touch");
  },

  fileEventNameToDbId(filename: string): string {
    return path.parse(filename).name;
  },

  needsTouchHack() {
    return needsTouchHack;
  },

  touchFile(config: Config, dbid: Uint8Array): Promise<void> {
    if (!needsTouchHack) {
      throw new Error("Touch hack is only required for darwin");
    }
    return fs.promises
      .open(ex.getTouchFilename(config, dbid), "w")
      .then((fd) => {
        return fd.close();
      });
  },

  uuidToBytes(uuid: string) {
    const hex = uuid.replaceAll("-", "");
    const ret = new Uint8Array(hex.length / 2);
    for (let c = 0; c < hex.length; c += 2) {
      ret[c / 2] = parseInt(hex.substring(c, c + 2), 16);
    }
    return ret;
  },

  dbidsAreEqual(a: Uint8Array, b: Uint8Array) {
    if (a.length !== b.length) {
      return false;
    }
    for (let c = 0; c < a.length; c++) {
      if (a[c] !== b[c]) {
        return false;
      }
    }
    return true;
  },
};

export default ex;
