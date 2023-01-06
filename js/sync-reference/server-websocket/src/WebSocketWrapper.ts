import { Socket } from "@vlcn.io/client-server-common";
import { WebSocket } from "ws";

export default class WebSocketWrapper implements Socket {
  constructor(private readonly ws: WebSocket) {
    ws.on("close", (code, reason) => {
      if (this.onclose) {
        this.onclose(code, reason);
      }
    });
    ws.on("message", (data) => {
      if (this.onmessage) {
        this.onmessage(new Uint8Array(data as any));
      }
    });
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
