# Auto Migrate

Point this script at an existing `SQLite` database and it will migrate all tables to be `CRR` and `CRDT` compliant.

Caveats:
- The only enforcably unique column may be the primary key
- Foreign key constraints are not support (foreign keys still exists -- just not the constraint). In other words, foreign keys might be dangling references. This is fine, IMO, since you should be using row level security anyway which renders all foreign keys potentially dangling.


---

Basic idea:

1. Open db
2. get insert statements
```
sqlite3 some.db .schema > schema.sql
sqlite3 some.db .dump > dump.sql
grep -vx -f schema.sql dump.sql > data.sql
```
3. get tables, excluding `sqlite_` tables via `table_list` pragma
4. for each table, get table info via `table_info(...)` pragma
5. create view and support tables sql files
6. open new db
7. run common support sql files on it
8. run files from step 5
