export type Config = {
  /**
   * Service name is available in case you host many different sync services.
   * Maybe you have several where each get their own schema and db dirs.
   */
  readonly serviceName: string;
  /**
   * Where SQLite databases should be created and persisted.
   */
  readonly dbsDir: string;
  readonly cacheTtlInSeconds: number;
  readonly notifyLatencyInMs: number;
  readonly serviceDbPath: string;
  readonly msgContentType: "application/json" | "application/octet-stream";
};
