todo:

- bump glob version at end of patch tx
  - will need to save max of largest version seen during patching
  - can we save this on the vtab struct?
    - vtab struct is one per connection
    - need a cas instruction to swap db vrs if gt existing vrs
- schema comparison before sync
  - ensure schemas are at same or compatible versions...
- pk validation
- replace binding where not needs? %Q?
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

  - test index of cl

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

Sync strategy for big peer:

- Connect to big peer
- send them all rows you've written since you last saw them
  - how to determine this though? you can record your db version from your last sync.
    and grab anything with a vclock entry for your site that is > that db version.
- ask them for all rows since your greatest timestamp for them

TODO:

- we don't have a plan for rows with large columns. We also currently send full rows rather than partial rows on update(s).
  To do partial rows would require clocks on the columns? or... you can cache version numbers for rows you've sent
  and use that to filter future updates.

  Or you can keep the full causal graph and just replay the causal graph to sync.
  Causal graph is an event log, timestamped by tx, that records (row, cols) that changed.
  In big-peer model we can drop this log after every complete sync.

---

Delta Generation:
Generate union query to grab primary keys from all tables where clock value > x.

Big peer method:

--

---

New mode:

```sql
CREATE TABLE foo (a primray key, b);

-- still need view... and `alive_v` vs `dead_v` ?
-- or just have deletion managed in user space as soft deletion? Gives user control over delete wins
-- and actually dropping the data vs keeping the data.

CREATE TABLE _foo__crsql_clock (a, col_num, col_v, site_id, primary key (a, col_num)); -- <-- will this have a auto-incr hidden rowid? hopefully. to be used for chunking sync operations.
CREATE INDEX _foo_col_v_idx__crsql_clock ON _foo__crsql_clock (col_v);

CREATE TRIGGER _foo_itrig AFTER INSERT ON foo BEGIN
  -- code-gen one insert per column...
  -- replace on conflict since we know db version is bumped on insert.
  -- NIT: we do not track primary key columns!
  -- INSERT OR REPLACE INTO _foo__crsql_clock (a, col_num, col_v, site_id) VALUES (NEW."a", 0, crsql_dbversion(), 0);
  INSERT OR REPLACE INTO _foo__crsql_clock (a, col_num, col_v, site_id) VALUES (NEW."a", 1, crsql_dbversion(), 0);
END;

CREATE TRIGGER _foo_utrig AFTER UPDATE ON foo BEGIN
  -- Do not track primary key columns!
  -- INSERT OR REPLACE INTO _foo__crsql_clock (a, col_num, col_v, site_id) SELECT (NEW."a", 0, crsql_dbversion(), 0) WHERE NEW."a" != OLD."a";
  INSERT OR REPLACE INTO _foo__crsql_clock (a, col_num, col_v, site_id) SELECT (NEW."a", 1, crsql_dbversion(), 0) WHERE NEW."b" != OLD."b";
END;

-- no delete trigger. We'll let the user implement delete as a soft delete if so desired.
-- a soft delete as a boolean lwwr

-- actually we do need a delete trigger so we can replicate a delete event.

-- this would probably be better to do in the extension itself rather than a trigger
-- patch trigger should not re-create a thing if it is deleted.
CREATE TRIGGER _foo_ptrig INSTEAD OF INSERT ON _foo__crsql_patch BEGIN
  -- sqlite with? ordered cols?
  WITH versions AS (SELECT col_v FROM _foo__crsql_clock WHERE pks = NEW.pks ORDER BY col_num ASC);

  -- check if the row being patched is deleted. don't patch if so.
  -- check if the patch is a delete. delete if so.

  INSERT INTO foo (
    a,
    b
  ) VALUES (
    NEW.a,
    NEW.b
  ) ON CONFLICT ("a") DO UPDATE SET
    "b" = CASE
      WHEN EXCLUDED.1_v > (SELECT v FROM versions WHERE col_v = 1) THEN EXCLUDED.b
      WHEN EXCLUDED.1_v = (SELECT v FROM versions WHERE col_v = 1) THEN
        CASE
          WHEN EXCLUDED.b > b THEN EXCLUED.b
          ELSE b
        END
      ELSE b
    END

  -- now to update the clocks / versions...
  INSERT INTO _foo__crsql_clock (a, col_num, col_v, site_id) NEW."a", 1, crsql_dbversion(), NEW.site_id ON CONFLICT ("a", col_num)
    DO UPDATE SET
      col_v = CASE WHEN EXCLUDED.col_v > col_v THEN EXCLUDED.col_v ELSE col_v END;
END;

COMMIT_HOOK --> crsql_nextDbVersion();
```

^-- or just a trigger that invokes a c function that does the insert?
^-- conditional insert: insert into foo (a) select (1) where 0;
^-- only set site id when merging in changes from remote.
^-- local changes don't require site id since site id is to prevent re-merges

How will patching work?
Patch view. Insert against that view.
Instead of insert we
-- select from clock table
-- only accept inserts for each colum where the clock is newer...

So...

patching should likely be done in the extension.

BEGIN
crsql_patch(table, rows)
crsql_patch(table, rows)
crsql_patch(table, rows)
COMMIT

^-- or invoke once per row in a loop... may simplify unpacking.

(1) Select all column versions for the row(s) being patched

```sql
select * from _foo__crsql_clock where pks = provided.pks;
```

(2) go thru each column, comparing column versions
(3) construct insert / update statements based on results

If thing to be patched is deleted, bail.
If thing being patched is a delete op, just delete.

^-- delete wins semantics.

Go back to bumping the clock per commit only?
This'll give us a way to gather changes into transactions.
Although prove difficult to chunk transacitons if needed.
Unless you add an auto-incr to chunk the transaction.. which can work.

For each table, get primary keys of changes since. Order by version, auto-incr
Group into same transaction(s).
Send transaction groups over wire.
Process 1k rows at a time per table?

---

vtab plan...

Patch vtab:
insert a patch row at a time...
Patch row insert looks like:

```sql
INSERT INTO crsql_patch (table_name, pkList, col1, col1_v, col2, col2_v, ...) VALUES (...);
```

^-- can we support varags insertion of vtab?

Changes since vtab:

```sql
SELECT * FROM crsql_changes_since WHERE version > $ AND site_id != $ ORDER BY version, rowid ASC;
```

this would return:
tbl-name, [pks], [cids], version, rowid?

Well you'd want to group on pks and aggregate in the cids and pks.
So you get a single row the represent the a row.
You can json_group_object to collect pks, cids.
Need to collect versions of each col too.

May be best to prototype this first.

similar to https://www.sqlite.org/unionvtab.html

rowid can be used to break up large changes within a single version

---

```sql
create table foo (a primary key, b);
create table baz (a primary key, b, c, d);
select crsql_as_crr('foo');
select crsql_as_crr('baz');
insert into foo values (1,2);
insert into baz values ('k', 'woo', 'doo', 'daa');
select * from crsql_changes;
```
