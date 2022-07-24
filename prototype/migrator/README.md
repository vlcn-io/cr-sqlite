# Auto Migrate

Point this script at an existing `SQLite` database and it will migrate all tables to be `CRR` and `CRDT` compliant.

Caveats:
- The only enforcably unique column may be the primary key
- Foreign key constraints are removed. In other words, foreign keys might be dangling references. This is fine, IMO, since you should be using row level security anyway which renders all foreign keys potentially dangling.