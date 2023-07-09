import { Config } from "../Types.js";

const TestConfig: Config = {
  serviceName: "test",
  dbsDir: "./dbs-test",
  cacheTtlInSeconds: 60,
  notifyLatencyInMs: 10,
  serviceDbPath: ":memory:",
  msgContentType: "application/json",
};

export default TestConfig;
