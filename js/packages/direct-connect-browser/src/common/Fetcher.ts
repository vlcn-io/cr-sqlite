import { Endpoints } from "../Types.js";
import { DBID } from "@vlcn.io/xplat-api";
import {
  ApplyChangesMsg,
  ApplyChangesResponse,
  CreateOrMigrateMsg,
  CreateOrMigrateResponse,
  EstablishOutboundStreamMsg,
  EstablishOutboundStreamResponse,
  GetChangesMsg,
  GetChangesResponse,
  GetLastSeenMsg,
  GetLastSeenResponse,
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
  ): Promise<CreateOrMigrateResponse> {
    return this._fetchWithRetry(
      this.endpoints.createOrMigrate,
      msg,
      this._post,
      retry
    ).then((res) => decodeResponse(res, this.serializer));
  }

  getChanges(msg: GetChangesMsg): Promise<GetChangesResponse> {
    return this._get(this.endpoints.getChanges!, msg).then((res) =>
      decodeResponse(res, this.serializer)
    );
  }

  applyChanges(msg: ApplyChangesMsg): Promise<ApplyChangesResponse> {
    return this._post(this.endpoints.applyChanges, msg).then((res) => {
      return decodeResponse(res, this.serializer);
    });
  }

  startOutboundStream(msg: EstablishOutboundStreamMsg): EventSource {
    const uri = new URL(this.endpoints.startOutboundStream);
    uri.searchParams.set(
      "msg",
      encodeURIComponent(this.serializer.encode(msg))
    );
    return new EventSource(uri);
  }

  getLastSeen(msg: GetLastSeenMsg): Promise<GetLastSeenResponse> {
    return this._get(this.endpoints.getLastSeen!, msg).then((res) =>
      decodeResponse(res, this.serializer)
    );
  }

  _post = (uri: string, msg: Msg) => {
    const body = this.serializer.encode(msg);
    // console.log("Posting to: ", uri, body);
    return fetch(uri, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": this.serializer.contentType,
      },
      body,
    });
  };

  _fetchWithRetry(
    uri: string,
    msg: Msg,
    verbFn: (uri: string, msg: Msg) => Promise<Response>,
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
        console.log(res);
        throw new Error("Failed to fetch");
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
    }) as any;
  }

  _get = (uri: string, msg: Msg) => {
    const uriCopy = new URL(uri.toString());
    uriCopy.searchParams.set(
      "msg",
      encodeURIComponent(this.serializer.encode(msg))
    );
    return fetch(uriCopy, {
      method: "GET",
      mode: "cors",
    });
  };
}

async function decodeResponse<T extends Msg>(
  resp: Response,
  serializer: ISerializer
): Promise<T> {
  if (!resp.ok) {
    console.log(resp);
    throw new Error("Failed to fetch");
  }
  switch (serializer.contentType) {
    case "application/json":
      return resp.json().then((json) => {
        return serializer.decode(json) as T;
      });
    case "application/octet-stream":
      return resp.arrayBuffer().then((buffer) => {
        return serializer.decode(buffer) as T;
      });
  }
}
