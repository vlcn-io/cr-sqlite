import Peer from "peerjs";
import { DB, Notifier } from "./createDb";
import PeerConnections from "./PeerConnections";

export default function P2P({ connections }: { connections: PeerConnections }) {
  return (
    <div class="p2p">
      <p>My peer id: {connections.me.id}</p>
      <p>Connected peers:</p>
      <ul></ul>
    </div>
  );
}
