# @vlcn.io/sync-lib

A library to facilitate creation of custom network layers atop cr-sqlite.

Currently in TypeScript, to be re-written in Rust for cross platform availability.

Can be run:

1. Standalone
2. As a library included in your existing server
3. In a service worker

There are three main endpoints the routes to which can be configured.

Each entrypoint will call an auth hook before executing the operation.

## Endpoints

- applyChanges(dbid, changes): send some changes to the server and apply them to the server DB. The server may reject them if they're out of order
- getChanges(dbid, since): get changes since X from the server
- startSSE(dbid, since): ask the server to stream changes as it receives them
- createDatabaseIfNotExists(dbid, schema): ask the server to create the database if it does not exist. Applies the schema string supplied.
- createOrMigrateDatabase(dbid, schema): ask the server to create the database or, if it exists, migrate it to the supplied schema. If the current DB schema matches the supplied schema this is a no-op.
- 🦺 getChangesForQueries(dbid, since, queries[]): ask the server to run N queries and return changes for data retrieved by those queries.

As a sync lib to be dropped into anything?
How would it handle peer and re-broadcast? We only re-broadcast to nodes that aren't the sending node and only send changes that aren't from the node we're broadcasting to?

## Lib Methods

- requestChanges(dbid, since) -> [seqStart = since, seqEnd, changes, vclock]
- applyChanges(dbid, [vClock, seqStart, seqEnd, changes])
  - writes tracking information
-

Push db version (max it on msg exchange) so on sync we can start with lowest db version of a given peer.

Middle ground won't work if we're only sending local changes :/

Capturing local changes, finding gaps.

On gaps, ask that specific node?

If we can ask any node... Those nodes need MD tracking.
Vector clock so you can ask other node for changes since X. Can pull from their v-clock entry.

So on merge with site_id, record site_id + vclock? So we know what data and when we have it from other peers?
vclock at row rather than col level? Just ship the whole row for those cases?

For pub sub, why not just ask the node itself that you're missing changes from?
Or, if a node has the node you're missing data for, full sync with it :|

Can we reduce site_id storage cost by making a lookup table for site_id? v-tab can auto-create the correct join for users.
This lookup table could facilitate the vector clock.

# TODO:

1. Start with REST based sync
2. Move to pub-sub based where nodes broadcast local changes. Nodes capture local changes. Nodes maybe save a version vector to catch other nodes up if a node winks offline?
   that some received changes for and others did not? Multicast similarity?
3. WebRTC re-broadcast sync?

Vector clock could work. If we know we're missing data we can ask other db for changes since.

What if gaps in vector clock stuff? Set latest contiguous to something and can only sync inside of contiguous range?

Maintain lists of contiguity?
