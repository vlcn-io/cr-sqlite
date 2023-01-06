import { Socket } from "@vlcn.io/client-server-common";

export default class WebSocketWrapper implements Socket {
  constructor(private readonly ws: WebSocket) {}

  onclose = undefined;
  onmessage = undefined;

  send(data: Uint8Array) {}

  closeForError(code?: number | undefined, data?: any): void {}

  removeAllListeners(): void {}
}
