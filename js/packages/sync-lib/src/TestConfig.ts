import { Config } from "./Types.js";

const TestConfig: Config = {
  serviceName: "test",
  dbsDir: "./dbs-test",
  schemasDir: "./schemas-test",
  cacheTtlInSeconds: 60,
  notifyLatencyInMs: 10,
};

export default TestConfig;
