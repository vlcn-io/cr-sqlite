import { Transport } from "./transport/Transport.js";

export default class SyncedDB {
  start() {}

  stop() {
    return true;
  }
}

export async function createSyncedDB(
  dbName: string,
  transport: Promise<Transport>
): Promise<SyncedDB> {
  return new SyncedDB();
}
