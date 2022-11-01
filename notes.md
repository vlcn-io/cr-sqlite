todo:

- handle ATTACH for shared db memory...
- register a destructor to tear down shared mem on module unload
- map shared mem by db file or some other such db isolation
- ensure -DSQLITE_OMIT_SHARED_CACHE is on when compiling wasm to reduce size
- pk only table testing
- dflt value or null reqs on schema
- https://github.com/aphrodite-sh/cr-sqlite/issues/16
  - oob cid
  - fill clocks for old table
- don't drop if `as_crr` is re-run. rather provide a return of:
  - success if the current crr tables are compatible with current table struct
  - errors if an alteration needs to be performed or constraints are incompatible
- Alter funcs:
  - drop column: problem
    - need to migrate versions to new cids
  - rename table: problem
    - need to rename clock table
    - test that trigger behavior is preserved
  - define `crsql_alter()` which runs the alter if it is safe, runs a series of statements to make it safe if not
- add logging
  - https://www.sqlite.org/capi3ref.html#sqlite3_log
- schema comparison before sync
  - ensure schemas are at same or compatible versions...
- pk validation
- replace binding where not needed? %Q?
- delete support
  sentinel col vers?
  -1 col?
  ...
- go through an ensure proper documentation on each function
- check proper utf8 handling via unsigned char everywhere
- finish multithreading test case
- validate tbl infos prior to replication as well as when converting to `as_crr`
- support for table with only pks
- throw if pk is not defined -- don't use rowid. See:
  - https://www.sqlabs.com/blog/2010/12/sqlite-and-unique-rowid-something-you-really-need-to-know/
- invariant on incompatible index types
- integrity checks by sync service? In case someone migrated a table and did not re-run `crr_from`?
- if a column gets changed to become part of the primary key set...
  - Need to drop version tracking on it
- inserts should... fail if already exists? Or always be upsert given we don't know what might already exist due to replications?
  - rn insert would fail if row exists. User can handle this as desired.
- sync lib for sending/receiving changes to/from peers
- c linters and static analyzers
  - https://clang-analyzer.llvm.org/command-line.html
  - https://cppcheck.sourceforge.io/
- test `as_crr` when schema name is provided
- idempotency of `as_crr` / support re-running `as_crr` against already crr-ified table.
  - to support altering a crr
- support quoted identifiers (i.e., %w or %q rather than what we have now)

  ```
  sqlite> create table """foo""" (a);
  sqlite> .tables
  "foo"
  sqlite> select * from foo;
  Error: no such table: foo
  ```

- support for:
  - centralized sync
    vs
  - p2p sync

Centralized sync can bound vector clock growth. Clients need to record the max value they have
from a given server / big peer.

Clients sending changes to server... They send all rows they've created or modified locally.

So.. storage can be the same as vector clock scheme (we have clocks, we have update src)
but syncing is different.

---

```sql
.mode column
create table foo (a primary key, b);
create table baz (a primary key, b, c, d);
select crsql_as_crr('foo');
select crsql_as_crr('baz');
insert into foo values (1,2);
insert into baz values ('a', 'woo', 'doo', 'daa');
select * from crsql_changes;

insert into crsql_changes ("table", pk, cid, val, version, site_id) values ('foo', 5, 1, '''thing''', 100, X'7096E2D505314699A59C95FABA14ABB5');
insert into crsql_changes ("table", pk, cid, val, version, site_id) values ('baz', '''a''', 1, 123, 101, X'7096E2D505314699A59C95FABA14ABB5');
```

```sql
table  pk   cid  val    version   site_id
-----  ---  ---  -----  --------  -------
foo    1    1    2      1
baz    'a'  1    'woo'  2
baz    'a'  2    'doo'  3
baz    'a'  3    'daa'  4
```

Any concern over using cids?
schemas match it doesn't matter.

Rly no other way to do it if you want to extract the cols and pks appropriately

memtest - https://calcagno.blog/m1dev/ & https://valgrind.org/docs/manual/quick-start.html
Given that valgrind doesn't work on monterey

---

xConnect on the vtab tells us the schema name so we can disambiguate attached dbs that way.
And select version from the vtab rather than fn extension...

Or have the `crsql_dbvserion` take a schema name.
^- does it need to given it is in a tirgger and thus on the local schema for that trigger?
^- well you need to know where to look up the dbversion in the global process memory.

---

Current workaround:

- each db has a uuid
- at extension load, query the uuid
- in a global, check if an entry exists for that uuid
  - if so, grab a pointer to that memory
  - if not, allocate it
