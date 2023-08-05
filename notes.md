# ios

https://mozilla.github.io/firefox-browser-architecture/experiments/2017-09-06-rust-on-ios.html
cargo install cargo-lipo
^-- https://github.com/TimNN/cargo-lipo/issues/60
https://www.reddit.com/r/rust/comments/12w9h4s/how_to_make_armv7appleios_target_by_myself/

```
cargo build -Zbuild-std --target=aarch64-apple-ios --features static,omit_load_extension
```

```
export CI_MAYBE_TARGET=aarch64-apple-ios
make loadable
clang: warning: using sysroot for 'MacOSX' but targeting 'iPhone' [-Wincompatible-sysroot]
```

^- repeat for every ios arch? How to universal binary?

https://stackoverflow.com/questions/823706/compiling-custom-sqlite-for-an-iphone-app
https://github.com/swiftlyfalling/SQLiteLib

# Prepared read

- parse values and use correct types for binding
-

# in-order in-tx + cursoring

- clock tbls without rowid
- new integer key for operation count rather than tx count
- populate similarly to dbversion

Compact on deletes. You have clock entries in there that need not exist after a row is deleted!!!

---

accumulating impacted rows:

- if many inserts to crsql_changes within the same tx... is xBegin called for each or only once for the
  entire tx?
- If the latter, we will return the _total_ accumulation across the entire TX.

---

# rga

Simplest RGA is row for each char.

How would we insert against the RGA? The insert must know the parent position it is inserting against. Thus we need
some integration with text editors and things...

Maybe no RGA? Just tell them to use Yjs or Automerge and save the blobs into the db...
A table of blobs or incremental blobs and occasional compaction.

# Better syntax:

Lets us easily define:

- counter
- lww
- fract index

for columns

- CL set or other

for tables

# Rest POKE protocol and SSEvents

https://github.com/jcubic/wayne/blob/gh-pages/docs/demo/sw.js

As simple as the p2p protocol. Server pokes via SSEvents. Simpler deployment than websockets.

Client pokes too? Or client streams to server?

Wayne support for SSE in ServiceWorker? https://blog.logrocket.com/comparing-wayne-js-express-js-service-worker-routing/

rest api can have schema application and upgrade endpoints (as needed for community server).
these can be auth gated or not (optional). For demos, just open? To allow client to force a schema.

# p2p

pi lab, discovery, ring connection vs pub-sub bus.

Pub-sub bus and gaps... where to go to fill the gaps? Broadcast need?
Broadcast max contiguous range held? Can keep in DHT and ask that person with the right range.

Compact on deletes. You have clock entries in there that need not exist after a row is deleted!!!

---

accumulating impacted rows:

- if many inserts to crsql_changes within the same tx... is xBegin called for each or only once for the
  entire tx?
- If the latter, we will return the _total_ accumulation across the entire TX.

---

# rga

Simplest RGA is row for each char.

How would we insert against the RGA? The insert must know the parent position it is inserting against. Thus we need
some integration with text editors and things...

Maybe no RGA? Just tell them to use Yjs or Automerge and save the blobs into the db...
A table of blobs or incremental blobs and occasional compaction.

# Better syntax:

Lets us easily define:

- counter
- lww
- fract index

for columns

- CL set or other

for tables

# Rest POKE protocol and SSEvents

https://github.com/jcubic/wayne/blob/gh-pages/docs/demo/sw.js

As simple as the p2p protocol. Server pokes via SSEvents. Simpler deployment than websockets.

Client pokes too? Or client streams to server?

Wayne support for SSE in ServiceWorker? https://blog.logrocket.com/comparing-wayne-js-express-js-service-worker-routing/

rest api can have schema application and upgrade endpoints (as needed for community server).
these can be auth gated or not (optional). For demos, just open? To allow client to force a schema.

# p2p

pi lab, discovery, ring connection vs pub-sub bus.

Pub-sub bus and gaps... where to go to fill the gaps? Broadcast need?
Broadcast max contiguous range held? Can keep in DHT and ask that person with the right range.

---

rlwrap

PK only table.
What do?

Insert as normal. We support PK only inserts.
PK delete? May not be supported.
PK Change. Def not supported.

PK change.. detect how?
After update trigger?

Update trigger when

Test:
pk only columns for insert and no rename or delete.

for rs tests --

- compile vanilla
- load the extension

---

pnpm changeset pre enter next

---

valgrind --leak-check=full -s --num-callers=200 dist/test

https://users.rust-lang.org/t/unresolved-external-symbol-s-when-trying-to-link-a-no-std-binary-to-a-windows-dll/54306
https://stackoverflow.com/questions/43866969/how-do-i-create-a-static-library-in-rust-to-link-with-c-code-in-windows

todo:

- flat buffer encoding of pks and values rather than string-concat encoding
- let server in client-server sync receive out of order events?

  - it isn't doing the peer tracking in client-server setup, client is, so this is ok
  - this means we don't need to override site id on the client

- update the p2p example to forward messages on behalf of other peers?
- site id must be proxied thru given comparison against it as a tie breaker
- delete doesn't record version? tech. ok given delete wins but it is information loss.
- relay / daisy chain data from peers via poke after receive.
  - poke could contain more info like:
    - peer poking for (if sync event)
    - max version held for that peer
- https://llvm.org/docs/LibFuzzer.html integration
- c tests for db version bumping
- document `crsql_finalize()`
- test cases for closed & open bug issues
- handle ATTACH for shared db memory...
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
- go through an ensure proper documentation on each function
- check proper utf8 handling via unsigned char everywhere
- finish multithreading test case
- validate tbl infos prior to replication as well as when converting to `as_crr`
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

---

single clock table impact on perf???

- would most likely impact bulk operations and concurrent transactions by creating contention on one dependency
  or are they tracked by row so fine?

Multi tab --
`crsql_db_version()`
(1) check if version alrdy set for tx in extData
if so, return it
(2) check the schema version via pragma https://www.sqlite.org/pragma.html#pragma_schema_version against ext data pragma v
if delta, finalize pStmt, fetch tblSchemas, re-create pStmt
(3) fetch max db version via pStmt
(4) return max

So get rid of `crsql_next_db_version()`

(2) should be split into its own function since vtab needs to check schema version and re-pull
table infos too

---

extra tests:

- test clean db version
- test clean then crr db version
- test reload
  ^-- these exist in correcntess tests

repro finalization problem with prepared statement in pExtData and extension destructor.

# Gyp

node-gyp build --debug
node-gyp rebuild --debug
node-gyp configure --debug

create table foo (a primary key, b);
select crsql_as_crr('foo');
insert into crsql_changes values ('foo', 1, 1, 1, 1, NULL);
