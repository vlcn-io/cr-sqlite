import {
  AnnouncePresence,
  Changes,
  RejectChanges,
  StartStreaming,
} from "@vlcn.io/ws-common";

export type TransporOptions = {
  url: string;
  room: string;
};

export interface Transport {
  // Announce ourselves to the server.
  // Give it our version vector so it can determine
  // min version to request from us and multiplex to peers.
  // Return to us @ what version we should start sending changes.
  start(onReady: () => void): void;

  announcePresence(msg: AnnouncePresence): void;
  sendChanges(msg: Changes): "reconnecting" | "buffer-full" | "sent";
  rejectChanges(msg: RejectChanges): void;

  onChangesReceived: ((msg: Changes) => Promise<void>) | null;

  // If we're set up in a p2p hub & spoke we'll want to rely on each peer
  // sending its own changes and excluding others.
  onStartStreaming: ((msg: StartStreaming) => Promise<void>) | null;

  onResetStream: ((msg: StartStreaming) => Promise<void>) | null;

  close(): void;
}
