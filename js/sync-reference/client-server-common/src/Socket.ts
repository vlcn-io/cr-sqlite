/**
 * Socket abstraction. Exposes the methods required by
 * the sync layer and allows users to implement the socket however
 * they like. E.g., via WebSockets, Socket.io, Rest, GraphQL, other
 */

type SocketEvent = "close" | "message" | "open";

interface Socket {
  onclose?: (code: number, reason: ArrayBuffer) => void;
  onmessage?: (data: ArrayBuffer) => void;
  onopen?: () => void;

  send(data: ArrayBuffer): void;
  closeOnError(): void;
}
