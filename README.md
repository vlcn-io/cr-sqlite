# [wip] crsql - Convergent, Replicated, SQLite

[![c-tests](https://github.com/vlcn-io/cr-sqlite/actions/workflows/c-tests.yaml/badge.svg)](https://github.com/vlcn-io/cr-sqlite/actions/workflows/c-tests.yaml)
[![c-valgrind](https://github.com/vlcn-io/cr-sqlite/actions/workflows/c-valgrind.yaml/badge.svg)](https://github.com/vlcn-io/cr-sqlite/actions/workflows/c-valgrind.yaml)
[![js-tests](https://github.com/vlcn-io/cr-sqlite/actions/workflows/js-tests.yaml/badge.svg)](https://github.com/vlcn-io/cr-sqlite/actions/workflows/js-tests.yaml)
[![py-tests](https://github.com/vlcn-io/cr-sqlite/actions/workflows/py-tests.yaml/badge.svg)](https://github.com/vlcn-io/cr-sqlite/actions/workflows/py-tests.yaml)

A standalone component of the [vlcn](https://vlcn.io) project | [discord](https://discord.gg/AtdVY6zDW3).

`crsql` is a [run time loadable extension](https://www.sqlite.org/loadext.html) for SQLite that adds CRDT and sync support.

[SQLite](https://www.sqlite.org/index.html) is a foundation of offline, local-first and edge deployed software. Wouldn't it be great, however, if we could merge two or more SQLite databases together and not run into any conflicts?

This project implements [CRDTs](https://crdt.tech/) and [CRRs](https://hal.inria.fr/hal-02983557/document) in `SQLite`, allowing databases that share a common schema to merge their state together. Merges can happen between an arbitrary number of peers and all peers will eventually converge to the same state.

`crsqlite` works by adding metadata tables and triggers around your existing database schema. This means that you do not have to change your schema in order to get conflict resolution support -- with a few caveats around uniqueness constraints and foreign keys. See [Schema Design for CRDTs & Eventual Consistency](#schema-design-for-crdts--eventual-consistency).

# Usage

The full documentation site is available [here](https://vlcn.io/docs/getting-started).

`crsqlite` exposes three APIs:

- A function extension (`crsql_as_crr`) to upgrade existing tables to "crrs" or "conflict free replicated relations"
  - `SELECT crsql_as_crr('table_name')`
- A virtual table (`crsql_changes`) to ask the database for changesets or to apply changesets from another database
  - `SELECT * FROM crsql_changes WHERE db_version > x AND site_id IS NULL` -- to get local changes
  - `SELECT * FROM crsql_changes WHERE db_version > x AND site_id != some_site` -- to get all changes excluding those synced from some site
  - `INSERT INTO crsql_changes VALUES ([patches receied from select on another peer])`
- And (on latest) `crsql_alter_begin('table_name')` & `crsql_alter_commit('table_name')` primitives to allow altering table definitions that have been upgraded to `crr`s.
  - Until we move forward with extending the syntax of SQLite to be CRR aware, altering CRRs looks like:
    ```sql
    SELECT crsql_alter_begin('table_name');
    -- 1 or more alterations to `table_name`
    ALTER TABLE table_name ...;
    SELECT crsql_alter_commit('table_name');
    ```
    A future version of cr-sqlite may extend the SQL syntax to make this more natural.

Application code would use the function extension to enable crr support on tables.
Networking code would use the `crsql_changes` virtual table to fetch and apply changes.

Usage looks like:

```sql
-- load the extension if it is not statically linked
.load crsqlite
.mode column
-- create tables as normal
create table foo (a primary key, b);
create table baz (a primary key, b, c, d);

-- update those tables to be crrs / crdts
select crsql_as_crr('foo');
select crsql_as_crr('baz');

-- insert some data / interact with tables as normal
insert into foo (a,b) values (1,2);
insert into baz (a,b,c,d) values ('a', 'woo', 'doo', 'daa');

-- ask for a record of what has changed
select * from crsql_changes;

table  pk   cid  val    col_version  db_version  site_id
-----  ---  ---  -----  -----------  ----------  -------
foo    1    b    2      1            1           1(�zL
                                                 \hx

baz    'a'  b    'woo'  1            2           1(�zL
                                                 \hx

baz    'a'  c    'doo'  1            2           1(�zL
                                                 \hx

baz    'a'  d    'daa'  1            2           1(�zL
                                                 \hx

-- merge changes from a peer
insert into crsql_changes
  ("table", pk, cid, val, col_version, db_version, site_id)
  values
  ('foo', 5, 'b', '''thing''', 5, 5, X'7096E2D505314699A59C95FABA14ABB5');
insert into crsql_changes ("table", pk, cid, val, col_version, db_version, site_id)
  values
  ('baz', '''a''', 'b', 123, 101, 233, X'7096E2D505314699A59C95FABA14ABB5');

-- check that peer's changes were applied
select * from foo;
a  b
-  -----
1  2
5  thing

select * from baz;
a  b    c    d
-  ---  ---  ---
a  123  doo  daa

-- tear down the extension before closing the connection
-- https://sqlite.org/forum/forumpost/c94f943821
select crsql_finalize();
```

# Packages

Note -- these are pre-release. Please look at [the open bugs](https://github.com/vlcn-io/cr-sqlite/issues?q=is%3Aissue+is%3Aopen+label%3Abug) if you're planning on taking them for a spin.

- Browser - [@vlcn.io/wa-crsqlite](https://github.com/vlcn-io/cr-sqlite/tree/main/js/browser/wa-crsqlite)
  - [usage](https://github.com/vlcn-io/cr-sqlite/tree/main/js/browser/examples)
  - [TodoMVC](https://github.com/vlcn-io/cr-sqlite/tree/main/js/examples)
  - [Strut.io re-write](https://github.com/tantaman/Strut/blob/master/app/src/main.tsx#L29-L31)
- NodeJS - [@vlcn.io/crsqlite](https://www.npmjs.com/package/@vlcn.io/crsqlite)

  - Usage:

  ```js
  const sqlite = require("better-sqlite3");
  const db = sqlite("filename.db");
  db.loadExtension(require.resolve("@vlcn.io/crsqlite"));
  ```

  or, es6:

  ```js
  import { resolve } from "import-meta-resolve";
  import Database from "better-sqlite3";

  const db = new Database(":memory");
  const modulePath = await resolve("@vlcn.io/crsqlite", import.meta.url);
  db.loadExtension(new URL(modulePath).pathname);
  ```

# Example Apps

Examples apps that use `cr-sqlite` and have a networking layer (albeit a dumb one at the moment) are being developed:

- [Working TODO MVC](https://github.com/vlcn-io/cr-sqlite/tree/main/js/examples/p2p-todomvc)
- [WIP Local-First Presentation Editor](https://github.com/tantaman/strut)
- [Observable Notebook](https://observablehq.com/@tantaman/cr-sqlite-basic-setup)

# Building

## [Run Time Loadable Extension](https://www.sqlite.org/loadext.htmla)

Instructions on building a native library that can be loaded into SQLite in non-wasm environments.

In the `core` directory of the project, run:

```bash
make loadable
```

This will create a shared library at `dist/crsqlite.[lib extension]`

[lib extension]:

- Linux: `.so`
- Darwin / OS X: `.dylib`
- Windows: `.dll`

## CLI

Instructions on building a `sqlite3` CLI that has `cr-sqlite` statically linked and pre-loaded.

In the `core` directory of the project, run:

```bash
make sqlite3
```

This will create a `sqlite3` binary at `dist/sqlite3`

## Tests

Ensure you've installed depenencies via `pnpm isntall` in the root director then run:

```bash
pnpm test
```

This will run all tests across native, js & python packages.

## WASM

Run `pnpm build` from the root directory.

> [pnpm](https://pnpm.io/), not npm.

# Prior Art

## [1] Towards a General Database Management System of Conflict-Free Replicated Relations

https://munin.uit.no/bitstream/handle/10037/22344/thesis.pdf?sequence=2

`crsqlite` improves upon [1] in the following ways --

- [1] stores two copies of all the data. `crsqlite` only keeps one by leveraging views and `ISNTEAD OF` triggers.
- [1] cannot compute deltas between databases without sending the full copy of each database to be compared. `crsqlite` only needs the logical clock (1 64bit int per peer) of a given database to determine what updates that database is missing.

## [2] Conflict-Free Replicated Relations for Multi-Synchronous Database Management at Edge

https://hal.inria.fr/hal-02983557/document

`crsqlite` improves upon [2] in the following ways --

- [2] is implemented in a specific ORM. `crsqlite` runs at the db layer and allows existing applications to interface with the db as normal.
- [2] keeps a queue of all writes. This queue is drained when those writes are merged. This means that [2] can only sync changes to a single centralized node. `crsqlite` keeps a logical clock at each database. If a new database comes online it sends its logical clock to a peer. That peer can compute what changes are missing from the clock.

## [3] CRDTs for Mortals

https://www.youtube.com/watch?v=DEcwa68f-jY

`crsqlite` improves upon [3] in the following ways --

- [3] requires retaining all history for all time (iiuc), `crsqlite` only needs the latest state
- [3] keeps a hloc per column, `crsqlite` only keeps an extra int per column and a clock per row.

[3] is better in the following way --

- `crsqlite` requires more work at the network layer to ensure ordered delivery and to deliver only the columns of a row that changed. [3] doesn't require any causal order to delivery and already identifies single column changes.

## Other

These projects helped improve my understanding of CRDTs on this journey --

- [shelf](https://github.com/dglittle/shelf)
- [tiny-merge](https://github.com/siliconjungle/tiny-merge)
- [Merkle-CRDT](https://arxiv.org/pdf/2004.00107.pdf)

# Schema Design for CRDTs & Eventual Consistency

`crsqlite` currently does not support:

1. Foreign key cosntraints. You can still have foreign keys (i.e. a column with an id of another row), but they can't be enforced by the db.
   1. TODO: discuss design alternatives and why this is actually not a bad thing when considering row level security.
2. Uniqueness constraints other than the primary key. The only enforceably unique column in a table should be the primary key. Other columns may be indices but they may not be unique.
   1. TODO: discuss this in much more detail.

Note: prior art [1] & [2] claim to support foreign key and uniqueness constraints. I believe their approach may be unsound and result in update loops and have not incoroprated it into `crsqlite` yet. If I'm wrong, I'll gladly fold their approach in.

# Architecture

## Tables

Tables are modeled as [GSets](<https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#G-Set_(Grow-only_Set)>) where each item has a [causal length](https://munin.uit.no/bitstream/handle/10037/19591/article.pdf?sequence=2). You can call this a "CLSet". This allows us to keep all rows as well as track deletes so your application will not see deleted rows.

## Rows

Rows are currently modeled as [LWW maps](https://bartoszsypytkowski.com/crdt-map/#crdtmapwithlastwritewinsupdates). I.e., each column in a row is a [LWW Register](https://bartoszsypytkowski.com/operation-based-crdts-registers-and-sets/#lastwritewinsregister).

Things to support in the future

- counter columns
- MVR (multi-value register) columns

## Deltas

Deltas between databases are calculated by each database keeping a [version vector](https://en.wikipedia.org/wiki/Version_vector) that represents the last time it synced with a given peer.

Every row and column in the database is associated with a [lamport timestamp](https://tantaman.com/2022-10-18-lamport-sufficient-for-lww.html). This clock allows peers to ask one another for updates since the last time they communicated.

# Future

- Sharing & Privacy -- in a real-world collaborative scenario, you may not want to share your entire database with other peers. Thus, in addition to clock information, we must keep visibility information to use when computing deltas and doing replication.
- Byzantine fault tolerance -- `crsqlite` currently assumes friendly actors. We need to guard against malicious updates.
- Subselects -- peers may want to sync subsets of the database even if they have access to the entire thing. Compute deltas but only send those deltas that fall into the peer's provided query.

# Example Use Case

Say we have a databse schema called "Animal App." Alice, Bob and Billy all have local copies of "Animal App" on their devices. They start their day at a hostel with all of their devices synced. They then part ways, backpacking into the wilderness each with their own copy of the db.

As they see different (or maybe even the same) animals, they record their observations.

- Name
- Genus
- Species
- Habitat
- Diet
- Etc.

Some observations may even involve making updates to the prior day's (or week's) observations written by other members of the party.

At the end of the day, the group comes back together. They need to merge all of their work. `crsqlite` will allow Alice, Bob and Billy to merge their changes (without conflict) in a p2p fashion and converge to the same state.

Note that "without conflict" would be based on the rules of the selected `CRDTs` used within the schema.

Some example are --

- Tables might be [grow only sets](<https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#G-Set_(Grow-only_Set)>) -- thus never losing an observation.
  - Or [sets with a causal length](https://www.youtube.com/watch?v=l4JxlK8Qzvs) so we can safely remove rows
- Table columns might be last write win (LWW) registers -- converging but throwing out earlier writes
- Table columns might be multi value (MV) registers -- keeping around all concurrent edits to a single column for users (or code) to pick and merge later.
- A column might be a [counter CRDT](https://www.cs.utexas.edu/~rossbach/cs380p-fall2019/papers/Counters.html) which accumulates all observations from all parties

# Old Design

A description of the original design. Note that this design was only used for the prototype and we've evolved it for the production version --
[![loom](https://cdn.loom.com/sessions/thumbnails/0934f93364d340e0ba658146a974edb4-with-play.gif)](https://www.loom.com/share/0934f93364d340e0ba658146a974edb4)
