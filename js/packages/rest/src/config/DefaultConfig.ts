import { Config } from "../Types.js";

const DefaultConfig: Config = {
  serviceName: "vlcn-default",
  dbsDir: "./dbs",
  cacheTtlInSeconds: 60 * 5,
  notifyLatencyInMs: 10,
  serviceDbPath: "./dbs/service.db",
};

export default DefaultConfig;
