import { DBID, Endpoints } from "../Types.js";
import {
  CreateOrMigrateMsg,
  ISerializer,
} from "@vlcn.io/direct-connect-common";

export default class Fetcher {
  constructor(
    private readonly endpoints: Endpoints,
    private readonly serializer: ISerializer
  ) {}

  createOrMigrate(msg: CreateOrMigrateMsg) {
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
