# cfsql - rust

A proof of concept `cfsql` has been built out in the `prototype` directory. This proof of concept showed that we could migrate existing dbs (via the `migrator` scripts) and do p2p replication (vis the `cf-music` example).

The proof of concept is a bit cumbersome to use. You can't just run "create" or "alter" table statements and have those tables be conflict free.
Pulling deltas and patches from the database was also a bit cumbersome in the prototype.

The Rust build of `cfsql` will be a production ready wrapper of `sqlite` that lets you create and alter tables as expected and have those tables be conflict free. This wrapper will be:
1. Usable as a CLI tool to alter & inspect existing sqlite dbs or create new ones
2. Embeddable to augment `sqlite` connections with new query primitives to fetch and apply patches.

Networking is a non-goal as `cfsql` only provides the conflict resolution and ways to fetch and apply patches to a database. Networking will need to be provided by the application or additional packages.

