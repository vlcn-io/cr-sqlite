import Peer from "peerjs";
import { createSignal, For } from "solid-js";
import { DB, Notifier } from "./createDb";
import PeerConnections from "./PeerConnections";

const colors = [
  "red",
  "white",
  "green",
  "grey",
  "brown",
  "magenta",
  "orange",
  "purple",
  "teal",
  "yellow",
  "bisque",
  "darkolivegreen",
  "darkslateblue",
];
export default function P2P({ connections }: { connections: PeerConnections }) {
  const [pendingPeers, setPendingPeers] = createSignal([
    ...connections.pendingPeers,
  ]);
  const [connectedPeers, setConnectedPeers] = createSignal([
    ...connections.peers.keys(),
  ]);
  const [newPeerId, setNewPeerId] = createSignal("");
  const [versions, setVersions] = createSignal(connections.versions);

  connections.onPeersChange(() => {
    setPendingPeers([...connections.pendingPeers]);
    setConnectedPeers([...connections.peers.keys()]);
    setVersions(new Map(connections.versions));
  });

  function addPeer(e) {
    e.preventDefault();
    connections.add(newPeerId());
    setNewPeerId("");
    return false;
  }

  function numChangesOn(peerId) {
    const vs = versions().get(peerId);
    if (vs == null) {
      return 0;
    }
    return vs[1] - vs[0];
  }

  return (
    <div class="p2p">
      <p>
        My peer id:{" "}
        <span
          style={{ color: colors[Math.floor(Math.random() * colors.length)] }}
        >
          {connections.id}
        </span>
      </p>
      <p>Connected peers</p>
      <ul>
        <For each={connectedPeers()}>
          {(p) => (
            <li
              style={{
                color: colors[Math.floor(Math.random() * colors.length)],
              }}
            >
              {p}
              <div style={{ color: "white" }}>
                <span
                  class="btn"
                  title="pull changes in from this peer"
                  onClick={() => {
                    connections.getUpdatesFrom(p);
                  }}
                >
                  Pull {numChangesOn(p)} Changes
                </span>
              </div>
            </li>
          )}
        </For>
      </ul>
      <p>Pending peers</p>
      <ul>
        <For each={pendingPeers()}>
          {(p) => (
            <li
              style={{
                color: colors[Math.floor(Math.random() * colors.length)],
              }}
            >
              {p}
            </li>
          )}
        </For>
      </ul>
      <form onSubmit={addPeer}>
        <input
          type="text"
          placeholder="Peer ID"
          value={newPeerId()}
          onChange={(e) => setNewPeerId((e.target as any).value)}
        ></input>
        <button>Add Peer</button>
      </form>
    </div>
  );
}
