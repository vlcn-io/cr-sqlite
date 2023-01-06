import { Socket } from "@vlcn.io/client-server-common";
import {
  ReplicatorArgs,
  default as createReplicator,
  Replicator,
} from "@vlcn.io/client-core";

class WebSocketWrapper implements Socket {
  constructor(private readonly ws: WebSocket) {
    ws.onclose = (e: CloseEvent) => {
      if (this.onclose) {
        this.onclose(e.code, e.reason);
      }
    };

    ws.onmessage = (e: MessageEvent<Uint8Array>) => {
      if (this.onmessage) {
        this.onmessage(new Uint8Array(e.data));
      }
    };
  }

  onclose?: (code: number, reason: any) => void = undefined;
  onmessage?: (data: Uint8Array) => void = undefined;

  send(data: Uint8Array) {
    this.ws.send(data);
  }

  closeForError(code?: number | undefined, data?: any): void {
    this.ws.close(code, data);
  }

  removeAllListeners(): void {
    this.onclose = undefined;
    this.onmessage = undefined;
  }
}

export default async function startSyncWith(
  args: ReplicatorArgs
): Promise<Replicator> {
  const ws = new WebSocket(args.uri);
  const replicator = await createReplicator(args);
  let resolved = false;
  return new Promise((resolve, reject) => {
    ws.onopen = () => {
      replicator.start(new WebSocketWrapper(ws));
      if (!resolved) {
        resolve(replicator);
        resolved = true;
      }
    };
  });
}
