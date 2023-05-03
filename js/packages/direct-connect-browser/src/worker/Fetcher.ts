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

const noRetryConfig: RetryConfig = {
  retryCount: 0,
  retryDelay: 0,
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
    return this._fetchWithRetry(
      this.endpoints.createOrMigrate,
      msg,
      this._post,
      retry
    );
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

  _fetchWithRetry(
    uri: URL,
    msg: Msg,
    verbFn: (uri: URL, msg: Msg) => Promise<Response>,
    retry: RetryConfig = noRetryConfig
  ): Promise<Response> {
    // fetch doesn't support retries, so we have to do it ourselves
    let retryCount = retry.retryCount;
    let retryDelay = retry.retryDelay;
    return verbFn(uri, msg).then((res) => {
      if (res.ok) {
        return res;
      }
      if (retryCount <= 0) {
        return res;
      }
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            this._fetchWithRetry(uri, msg, verbFn, {
              retryCount: retryCount - 1,
              retryDelay: retryDelay * 2,
            })
          );
        }, retryDelay);
      });
    });
  }

  _get = (uri: URL, msg: Msg) => {
    const uriCopy = new URL(uri.toString());
    uriCopy.searchParams.set("msg", this.serializer.encode(msg));
    return fetch(uriCopy);
  };
}
