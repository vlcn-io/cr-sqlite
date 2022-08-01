# cfsql - rust - cli

This is analogous to the `sqlite3` binary. This will be used to create and modify `sqlite` databases to be conflict free.

The predecessor to this is the `prototype/migrator` package which migrates all tables in a database.

The main difference is that this CLI allows interactive interactions with the database, querying the db, modifying tables individually, creating new tables.

