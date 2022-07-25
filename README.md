# cfsqlite - conflict-free-sqlite

[SQLite](https://www.sqlite.org/index.html) is a foundation of offline, local-first and edge deployed software. Wouldn't it be great, however, if we could merge two or more SQLite databases together and not run into any conflicts?

This project implements [CRDTs](https://crdt.tech/) and [CRRs](https://hal.inria.fr/hal-02983557/document) in `SQLite`, allowing databses that share a common schema to merge their state together. This scales to an arbitrary number of peers and merges between peers can happen in any order.

`cfsqlite` works by adding metadata tables and triggers around your existing database schema. This means that you do not have to change your schema in order to get conflict resolution support -- with a few caveats around uniqueness constraints and foreign keys. See [Schema Design for CRDTs & Eventual Consistency](#schema-design-for-crdts--eventual-consistency).

# Demo

[![Watch](https://img.youtube.com/vi/TKOGItt04OA/maxresdefault.jpg)](https://youtu.be/TKOGItt04OA)

# Prior Art

## [1] Towards a General Database Management System of Conflict-Free Replicated Relations
https://munin.uit.no/bitstream/handle/10037/22344/thesis.pdf?sequence=2

`cfsqlite` improves upon [1] in the following ways --

- [1] stores two copies of all the data. `cfsqlite` only keeps one by leveraging views and `ISNTEAD OF` triggers.
- [1] cannot compute deltas between databases without sending the full copy of each database to be compared. `cfsqlite` only needs the logical clock (1 64bit int per peer) of a given database to determine what updates that database is missing.

## [2] Conflict-Free Replicated Relations for Multi-Synchronous Database Management at Edge
https://hal.inria.fr/hal-02983557/document

`cfsqlite` improves upon [2] in the following ways --

- [2] is implemented in a specific ORM. `cfsqlite` runs at the db layer and allows existing applications to interface with the db as normal.
- [2] keeps a queue of all writes. This queue is drained when those writes are merged. This means that [2] can only sync changes to a single centralized node. `cfsqlite` keeps a logical clock at each database. If a new database comes online it sends its logical clock to a peer. That peer can compute what changes are missing from the clock.

## [3] CRDTs for Mortals
https://www.youtube.com/watch?v=DEcwa68f-jY

`cfsqlite` improves upon [3] in the following ways --

- [3] isn't really relational it all. It saves all data in a single table and is using sqlite as a key-value store. As such, it cannot work with your existing database schema. `cfsqlite` builds around your existing schemas.

## Other

These projects helped improve my understanding of CRDTs on this journey --

- [shelf](https://github.com/dglittle/shelf)
- [tiny-merge](https://github.com/siliconjungle/tiny-merge)
- [Merkle-CRDT](https://arxiv.org/pdf/2004.00107.pdf)
  - Not used yet but might become an alternative clock implementation for use cases with unbounded numbers of peers

# Schema Design for CRDTs & Eventual Consistency

`cfsqlite` currently does not support:
1. Foreign key cosntraints. You can still have foreign keys (i.e. a column with an id of another row), but they can't be enforced by the db.
   1. TODO: discuss design alternatives and why this is actually not a bad thing when considering row level security.
2. Uniqueness constraints other than the primary key. The only enforceably unique column in a table should be the primary key. Other columns may be indices but they may not be unique.
   1. TODO: discuss this in much more detail.


Note: prior art [1] & [2] claim to support foreign key and uniqueness constraints. I believe their approach is unsound and results in update loops and have not incoroprated it into `cfsqlite`. If I'm wrong, I'll gladly fold their approach in.

# Architecture

## Tables

Tables are modeled as [GSets](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#G-Set_(Grow-only_Set)) where each item has a [causal length](https://munin.uit.no/bitstream/handle/10037/19591/article.pdf?sequence=2). You can call this a "CLSet". This allows us to keep all rows as well as track deletes so your application will not see deleted rows.

## Rows

Rows are currently modeled as [LWWW maps](https://bartoszsypytkowski.com/crdt-map/#crdtmapwithlastwritewinsupdates). I.e., each column in a row is a [LWW Register](https://bartoszsypytkowski.com/operation-based-crdts-registers-and-sets/#lastwritewinsregister).

Things to support in the future
- counter columns
- MVR (multi-value register) columns

## Deltas

Deltas between databases are calculated by each database keeping a [version vector](https://en.wikipedia.org/wiki/Version_vector) on each database.

Every row in the database is associated with a copy of the version vector. This copy is a snapshot of the value of the vector at the time the most recent write was made to the row.

If DB-A wants changes from DB-B,
- DB-A sends its version vector to DB-B
- DB-B finds all rows for which _any_ element in the snapshot vectors is _greater_ than the corresponding element in the provided vector or for which the provided vector is missing an entry
- DB-B sends these rows to DB-A
- DB-A applys the changes
- DB-A now has all of DB-B's updates

This algorithm requires causal delivery of message during the time which two peers decide to sync.

# Implementation

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

At the end of the day, the group comes back together. They need to merge all of their work. `cfsqlite` will allow Alice, Bob and Billy to merge their changes (without conflict) in a p2p fashion and converge to the same state.

Note that "without conflict" would be based on the rules of the selected `CRDTs` used within the schema.

Some example are --
- Tables might be [grow only sets](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#G-Set_(Grow-only_Set)) -- thus never losing an observation.
  - Or [sets with a causal length](https://www.youtube.com/watch?v=l4JxlK8Qzvs) so we can safely remove rows
- Table columns might be last write win (LWW) registers -- converging but throwing out earlier writes
- Table columns might be multi value (MV) registers -- keeping around all concurrent edits to a single column for users (or code) to pick and merge later.
- A column might be a [counter CRDT](https://www.cs.utexas.edu/~rossbach/cs380p-fall2019/papers/Counters.html) which accumulates all observations from all parties
