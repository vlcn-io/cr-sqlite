import { DBID, Endpoints } from "../Types.js";
import {
  ApplyChangesMsg,
  CreateOrMigrateMsg,
  EstablishOutboundStreamMsg,
  GetChangesMsg,
  GetLastSeenMsg,
  ISerializer,
  Msg,
} from "@vlcn.io/direct-connect-common";

export type RetryConfig = {
  readonly retryCount: number;
  readonly retryDelay: number;
};

const defaultRetryConfig: RetryConfig = {
  retryCount: 3,
  retryDelay: 1000,
};

export default class Fetcher {
  constructor(
    private readonly endpoints: Endpoints,
    private readonly serializer: ISerializer
  ) {}

  createOrMigrate(
    msg: CreateOrMigrateMsg,
    retry: RetryConfig = defaultRetryConfig
  ) {
    return this._post(this.endpoints.createOrMigrate, msg);
  }

  getChanges(msg: GetChangesMsg) {
    return this._get(this.endpoints.getChanges, msg);
  }

  applyChanges(msg: ApplyChangesMsg) {
    return this._post(this.endpoints.applyChanges, msg);
  }

  establishOutboundStream(msg: EstablishOutboundStreamMsg) {
    return this._post(this.endpoints.establishOutboundStream, msg);
  }

  getLastSeen(msg: GetLastSeenMsg) {
    return this._get(this.endpoints.getLastSeen, msg);
  }

  _post(uri: URL, msg: Msg) {
    return fetch(uri, {
      method: "POST",
      body: this.serializer.encode(msg),
    });
  }

  _get(uri: URL, msg: Msg) {
    const uriCopy = new URL(uri.toString());
    uriCopy.searchParams.set("msg", this.serializer.encode(msg));
    return fetch(uriCopy, {
      method: "GET",
    });
  }
}
