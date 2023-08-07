# @vlcn.io/partykit-server

PartyKit provides an abstraction over `Websockets` and allows people connected to the same room to sync their state.

This is a reference implementation of using PartyKit to sync `cr-sqlite` databases.

Current implementation:

- Each room corresponds to an entire shared database. All people who connect to the same room will end up sharing the same database.
- Rooms do not store persist any state themselves and rather just relay sync messages between connected peers.

## Sketch

- Poke protocol
- On connect, poke that changes are available from `client_id:db_version`
- Broadcast to connected peers
- Connected peers can ask for those changes or not
- On local change, poke that changes are available
- etc. etc.
- local dbs track `last_seen` from remotes and ask for changes since then.
- local dbs discard out of order changes if those happen.
