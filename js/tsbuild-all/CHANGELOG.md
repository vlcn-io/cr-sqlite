# @vlcn.io/tsbuild-all

## 0.13.0-next.0

### Minor Changes

- re-insertion, api naming consistencies, metadata size reduction, websocket server, websocket client, websocket demo

## 0.12.0

### Minor Changes

- 68deb1c: binary encoded primary keys, no string encoding on values, cache prepared statements on merge, fix webkit JIT crash

## 0.12.0-next.0

### Minor Changes

- binary encoded primary keys, no string encoding on values, cache prepared statements on merge, fix webkit JIT crash

## 0.11.0

### Minor Changes

- 62912ad: split up large transactions, compact out unneeded delete records, coordinate dedicated workers for android, null merge fix

## 0.11.0-next.0

### Minor Changes

- split up large transactions, compact out unneeded delete records, coordinate dedicated workers for android, null merge fix

## 0.10.0

### Minor Changes

- 7885afd: 50x perf boost when pulling changesets

## 0.10.0-next.0

### Minor Changes

- 15c8e04: 50x perf boost when pulling changesets

## 0.9.0

### Minor Changes

- automigrate fixes for WASM, react fixes for referential equality, direct-connect networking implementations, sync in shared worker, dbProvider hooks for React

## 0.8.1

### Patch Changes

- fts5, sqlite 3.42.1, direct-connect packages

## 0.8.0

### Minor Changes

- e0de95c: ANSI SQL compliance for crsql_changes, all filters available for crsql_changes, removal of tracked_peers, simplified crsql_master table

### Patch Changes

- 9b483aa: npm is not updating on package publish -- bump versions to try to force it

## 0.8.0-next.1

### Patch Changes

- npm is not updating on package publish -- bump versions to try to force it

## 0.8.0-next.0

### Minor Changes

- ANSI SQL compliance for crsql_changes, all filters available for crsql_changes, removal of tracked_peers, simplified crsql_master table

## 0.7.2

### Patch Changes

- e5919ae: fix xcommit deadlock, bump versions on dependencies

## 0.7.2-next.0

### Patch Changes

- fix xcommit deadlock, bump versions on dependencies

## 0.7.1

### Patch Changes

- aad733d: --

## 0.7.1-next.0

### Patch Changes

---

## 0.7.0

### Minor Changes

- 6316ec315: update to support prebuild binaries, include primary key only table fixes

## 0.7.0-next.0

### Minor Changes

- update to support prebuild binaries, include primary key only table fixes

## 0.6.2

### Patch Changes

- 3d09cd595: preview all the hook improvements and multi db open fixes
- 567d8acba: auto-release prepared statements
- 54666261b: fractional indexing inclusion
- fractional indexing, better react hooks, many dbs opened concurrently

## 0.6.2-next.2

### Patch Changes

- preview all the hook improvements and multi db open fixes

## 0.6.2-next.1

### Patch Changes

- auto-release prepared statements

## 0.6.2-next.0

### Patch Changes

- fractional indexing inclusion

## 0.6.1

### Patch Changes

- 519bcfc2a: hooks, fixes to support examples, auto-determine tables queried
- hooks package, used_tables query, web only target for wa-sqlite

## 0.6.1-next.0

### Patch Changes

- hooks, fixes to support examples, auto-determine tables queried

## 0.6.0

### Minor Changes

- seen peers, binary encoding for network layer, retry on disconnect for server, auto-track peers

## 0.5.3

### Patch Changes

- deploy table validation fix

## 0.5.2

### Patch Changes

- cid winner selection bugfix

## 0.5.1

### Patch Changes

- rebuild all

## 0.5.0

### Minor Changes

- breaking change -- fix version recording problem that prevented convergence in p2p cases

## 0.4.1

### Patch Changes

- fix mem leak and cid win value selection bug

## 0.4.0

### Minor Changes

- fix tie breaking for merge, add example client-server sync

## 0.3.1

### Patch Changes

- fix bigint overflow in wasm, fix site_id not being returned with changesets

## 0.3.0

### Minor Changes

- fix multi-way merge

## 0.2.0

### Minor Changes

- update to use `wa-sqlite`, fix site id forwarding, fix scientific notation replication, etc.

## 0.1.5

### Patch Changes

- fix linking issues on linux distros

## 0.1.4

### Patch Changes

- fixes site id not being passed during replication

## 0.1.3

### Patch Changes

- fix statement preparation error in cases where there are multiple concurrent db connections

## 0.1.2

### Patch Changes

- update sqlite binaries

## 0.1.1

### Patch Changes

- remove `link:../` references so we actually correctly resolve packages

## 0.1.0

### Minor Changes

- first release that works end to end
