# crsql/native

The core SQLite extension which adds CRDT/CRR support.

No networking layer, just a way to:

1. Create CRRs
2. Pull changesets from the DB
3. Apply changesets to the DB
