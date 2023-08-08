# @vlcn.io/ws-server

PartyKit provides an abstraction over `Websockets` and allows people connected to the same room to sync their state.

This is a reference implementation of using PartyKit to sync `cr-sqlite` databases.

Current implementation:

- Each room corresponds to an entire shared database. All people who connect to the same room will end up sharing the same database.
- Rooms do not store persist any state themselves and rather just relay sync messages between connected peers.

## Sketch

- Poke protocol
- On connect, poke that changes are available from `client_id:db_version`
- All connected ppl also tell new person that they have changes available
- Just do it as streaming? With many connections?
- Broadcast to connected peers
- Connected peers can ask for those changes or not
- On local change, poke that changes are available
- etc. etc.
- local dbs track `last_seen` from remotes and ask for changes since then.
- local dbs discard out of order changes if those happen.

---

Essentially p2p with a broker.

So just create it as a generic streaming p2p? With generic transport?

Not poke but stream establish?

1. Connect
2. Broadcast peer's presence to everyone
3. Everyone replies with when they last saw peer
4. Server stores this
5. Server sends lowest version to client
6. Client sends changes up to server via outbound stream
7. Server splits this
8. Server sends relevant pieces to clients
9. Server bumps up lowest version
10. If client got out-of-order, client re-asks for older data
11. server bumps down
12. resets stream with problematic node
