import { Socket, uuidStrToBytes } from "@vlcn.io/client-server-common";
import {
  ReplicatorArgs,
  default as createReplicator,
  Replicator,
} from "@vlcn.io/client-core";

const defaultBackoff = 5000;
class WebSocketWrapper implements Socket {
  private ws: WebSocket | null = null;
  private backoff: number = defaultBackoff;
  private reconnecting: boolean = false;

  constructor(
    private readonly uri: string,
    private readonly replicator: Replicator
  ) {}

  start() {
    if (this.reconnecting) {
      return;
    }
    const ws = (this.ws = new WebSocket(this.uri));
    ws.onerror = (e: Event) => {
      this.replicator.stop();
      console.log("closed for error");
      this.#reconnect();
    };

    ws.onopen = async () => {
      this.backoff = defaultBackoff;
      ws.onclose = (e: CloseEvent) => {
        if (this.onclose) {
          this.onclose(e.code, e.reason);
        }
        if (e.code === 1006) {
          this.#reconnect();
        }
      };

      ws.onmessage = (e: MessageEvent<Blob>) => {
        e.data.arrayBuffer().then((b) => {
          if (this.onmessage) {
            this?.onmessage(new Uint8Array(b));
          }
        });
      };
      await this.replicator.start(this);
    };
  }

  onclose?: (code: number, reason: any) => void = undefined;
  onmessage?: (data: Uint8Array) => void = undefined;

  send(data: Uint8Array) {
    this.ws?.send(data);
  }

  closeForError(code?: number | undefined, data?: any): void {
    this.ws?.close(code, data);
    console.log("closed for error 2");
    this.#reconnect();
  }

  close(code?: number | undefined, data?: any): void {
    this.ws?.close(code, data);
  }

  removeAllListeners(): void {
    this.onclose = undefined;
    this.onmessage = undefined;
  }

  #reconnect() {
    if (this.reconnecting) {
      return;
    }
    console.log("reconnecting");

    this.reconnecting = true;
    const backoff = this.backoff;
    this.backoff = Math.min(60000, backoff * 2);
    setTimeout(() => {
      this.reconnecting = false;
      this.start();
    }, backoff);
  }
}

export { uuidStrToBytes } from "@vlcn.io/client-server-common";

export default async function startSyncWith(
  uri: string,
  args: ReplicatorArgs
): Promise<Replicator> {
  const replicator = await createReplicator(args);
  const wrapper = new WebSocketWrapper(uri, replicator);
  wrapper.start();
  return replicator;
}
