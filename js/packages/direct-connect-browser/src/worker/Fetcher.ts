import { Endpoints } from "../Types.js";

export default class Fetcher {
  constructor(private readonly endpoints: Endpoints) {}

  getChanges(dbid: string) {}

  applyChanges() {}

  establishOutboundStream() {}

  getLastSeen() {}
}
