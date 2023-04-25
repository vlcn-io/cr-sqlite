# @vlcn.io/server-rest

A simple rest server to facilitate data sync.

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
