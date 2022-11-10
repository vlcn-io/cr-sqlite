import { PeerServer } from "peer";
const peerServer = PeerServer({ port: 9000, path: "/examples" });

console.log("Running at http://localhost:9000/examples");
