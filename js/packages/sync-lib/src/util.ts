import { Config } from "./Types";

export default {
  getDbFilename(config: Config, dbid: string): string {
    return config.dbsDir + "/" + dbid;
  },
  fileEventNameToDbId(filename: string): string {
    return filename.replaceAll(".db", "").replaceAll("-wal", "");
  },
};
