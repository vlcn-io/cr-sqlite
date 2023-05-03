import { DBID, Endpoints } from "../Types.js";

export default class Fetcher {
  constructor(private readonly endpoints: Endpoints) {}

  createOrMigrate(remoteDbid: DBID, localDbid: DBID) {
    return fetch(this.endpoints.createOrMigrate, {
      method: "POST",
      body: JSON.stringify({ remoteDbid, localDbid }),
    });
  }

  getChanges(dbid: DBID) {
    return fetch(this.endpoints.getChanges, {
      method: "POST",
      body: JSON.stringify({ dbid }),
    });
  }

  applyChanges() {}

  establishOutboundStream() {}

  getLastSeen() {}
}
