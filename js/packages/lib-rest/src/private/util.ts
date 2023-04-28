import { Config } from "../Types.js";
import path from "path";
import os from "os";
import fs from "fs";

const isDarwin = os.platform() === "darwin";
const ex = {
  getDbFilename(config: Config, dbid: Uint8Array): string {
    return path.join(config.dbsDir, bytesToHex(dbid) + ".db");
  },

  getTouchFilename(config: Config, dbid: Uint8Array): string {
    return path.join(config.dbsDir, bytesToHex(dbid) + ".touch");
  },

  fileEventNameToDbId(filename: string): string {
    return path.parse(filename).name;
  },

  isDarwin() {
    return isDarwin;
  },

  touchFile(config: Config, dbid: Uint8Array): Promise<void> {
    if (!isDarwin) {
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

  hexToBytes,
  bytesToHex,

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

  readSchema(
    config: Config,
    schemaName: string,
    schemaVersion: string
  ): Promise<string> {
    return fs.promises.readFile(
      path.join(config.schemasDir, schemaName + "." + schemaVersion + ".sql"),
      "utf8"
    );
  },

  noFsChars,
};

function noFsChars(str: string) {
  // ensure the filename does not contain any restricted characters

  if (
    str.includes("/") ||
    str.includes("\\") ||
    str.includes(":") ||
    str.includes("*") ||
    str.includes("?") ||
    str.includes('"') ||
    str.includes("<") ||
    str.includes(">") ||
    str.includes("|")
  ) {
    throw new Error(
      'Schema name/version cannot contain any of: / \\ : * ? " < > |'
    );
  }

  return str;
}

function hexToBytes(hex: string) {
  const ret = new Uint8Array(hex.length / 2);
  for (let c = 0; c < hex.length; c += 2) {
    ret[c / 2] = parseInt(hex.substring(c, c + 2), 16);
  }
  return ret;
}

function bytesToHex(bytes: Uint8Array) {
  let hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    let current = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex.push((current >>> 4).toString(16));
    hex.push((current & 0xf).toString(16));
  }
  return hex.join("");
}

export default ex;
