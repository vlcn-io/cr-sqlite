import path from "path";
import { Config } from "../Types.js";

const DefaultConfig: Config = {
  serviceName: "vlcn-default",
  dbsDir: path.join(".", "dbs"),
  cacheTtlInSeconds: 60 * 5,
  notifyLatencyInMs: 10,
  serviceDbPath: "./dbs/service.db",
  msgContentType: "application/json",
};

export default DefaultConfig;
