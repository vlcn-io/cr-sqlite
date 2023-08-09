# @vlcn.io/wa-crsqlite

## 0.15.0-next.0

### Minor Changes

- re-insertion, api naming consistencies, metadata size reduction, websocket server, websocket client, websocket demo

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.21.0-next.0
  - @vlcn.io/xplat-api@0.14.0-next.0

## 0.14.0

### Minor Changes

- 68deb1c: binary encoded primary keys, no string encoding on values, cache prepared statements on merge, fix webkit JIT crash

### Patch Changes

- Updated dependencies [68deb1c]
  - @vlcn.io/wa-sqlite@0.20.0
  - @vlcn.io/xplat-api@0.13.0

## 0.14.0-next.0

### Minor Changes

- binary encoded primary keys, no string encoding on values, cache prepared statements on merge, fix webkit JIT crash

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.20.0-next.0
  - @vlcn.io/xplat-api@0.13.0-next.0

## 0.13.0

### Minor Changes

- 62912ad: split up large transactions, compact out unneeded delete records, coordinate dedicated workers for android, null merge fix

### Patch Changes

- Updated dependencies [62912ad]
  - @vlcn.io/wa-sqlite@0.19.0
  - @vlcn.io/xplat-api@0.12.0

## 0.13.0-next.0

### Minor Changes

- split up large transactions, compact out unneeded delete records, coordinate dedicated workers for android, null merge fix

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.19.0-next.0
  - @vlcn.io/xplat-api@0.12.0-next.0

## 0.12.0

### Minor Changes

- 7885afd: 50x perf boost when pulling changesets

### Patch Changes

- Updated dependencies [7885afd]
  - @vlcn.io/wa-sqlite@0.18.0
  - @vlcn.io/xplat-api@0.11.0

## 0.12.0-next.0

### Minor Changes

- 15c8e04: 50x perf boost when pulling changesets

### Patch Changes

- Updated dependencies [15c8e04]
  - @vlcn.io/wa-sqlite@0.18.0-next.0
  - @vlcn.io/xplat-api@0.11.0-next.0

## 0.11.0

### Minor Changes

- automigrate fixes for WASM, react fixes for referential equality, direct-connect networking implementations, sync in shared worker, dbProvider hooks for React

### Patch Changes

- 4e737a0: better error reporting on migration failure, handle schema swap
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.17.0
  - @vlcn.io/xplat-api@0.10.0

## 0.10.2-next.0

### Patch Changes

- better error reporting on migration failure, handle schema swap

## 0.10.1

### Patch Changes

- 6dbfdcb: include fts5 & bump to sqlite 3.41.2
- fts5, sqlite 3.42.1, direct-connect packages
- Updated dependencies [6dbfdcb]
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.16.1
  - @vlcn.io/xplat-api@0.9.1

## 0.10.1-next.0

### Patch Changes

- include fts5 & bump to sqlite 3.41.2
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.16.1-next.0

## 0.10.0

### Minor Changes

- e0de95c: ANSI SQL compliance for crsql_changes, all filters available for crsql_changes, removal of tracked_peers, simplified crsql_master table

### Patch Changes

- 9b483aa: npm is not updating on package publish -- bump versions to try to force it
- Updated dependencies [9b483aa]
- Updated dependencies [e0de95c]
  - @vlcn.io/xplat-api@0.9.0
  - @vlcn.io/wa-sqlite@0.16.0

## 0.10.0-next.1

### Patch Changes

- npm is not updating on package publish -- bump versions to try to force it
- Updated dependencies
  - @vlcn.io/xplat-api@0.9.0-next.1
  - @vlcn.io/wa-sqlite@0.16.0-next.1

## 0.10.0-next.0

### Minor Changes

- ANSI SQL compliance for crsql_changes, all filters available for crsql_changes, removal of tracked_peers, simplified crsql_master table

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.16.0-next.0
  - @vlcn.io/xplat-api@0.9.0-next.0

## 0.9.4

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.15.4

## 0.9.3

### Patch Changes

- e5919ae: fix xcommit deadlock, bump versions on dependencies
- Updated dependencies [e5919ae]
  - @vlcn.io/wa-sqlite@0.15.3
  - @vlcn.io/xplat-api@0.8.2

## 0.9.3-next.0

### Patch Changes

- fix xcommit deadlock, bump versions on dependencies
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.15.3-next.0
  - @vlcn.io/xplat-api@0.8.2-next.0

## 0.9.2

### Patch Changes

- 2bbf074: nextjs fix and better reconnect on refocus for mobile
- b1b77cf: js include for webpack
- Updated dependencies [2bbf074]
  - @vlcn.io/wa-sqlite@0.15.2

## 0.9.2-next.1

### Patch Changes

- js include for webpack

## 0.9.2-next.0

### Patch Changes

- nextjs fix and better reconnect on refocus for mobile
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.15.2-next.0

## 0.9.1

### Patch Changes

- aad733d: --
- Updated dependencies [aad733d]
  - @vlcn.io/wa-sqlite@0.15.1
  - @vlcn.io/xplat-api@0.8.1

## 0.9.1-next.0

### Patch Changes

---

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.15.1-next.0
  - @vlcn.io/xplat-api@0.8.1-next.0

## 0.9.0

### Minor Changes

- 14c9f4e: useQuery perf updates, primary key only table fixes, sync in a background worker

### Patch Changes

- Updated dependencies [14c9f4e]
  - @vlcn.io/xplat-api@0.8.0

## 0.9.0-next.0

### Minor Changes

- useQuery perf updates, primary key only table fixes, sync in a background worker

### Patch Changes

- Updated dependencies
  - @vlcn.io/xplat-api@0.8.0-next.0

## 0.8.0

### Minor Changes

- 6316ec315: update to support prebuild binaries, include primary key only table fixes

### Patch Changes

- Updated dependencies [6316ec315]
  - @vlcn.io/wa-sqlite@0.15.0
  - @vlcn.io/xplat-api@0.7.0

## 0.8.0-next.0

### Minor Changes

- update to support prebuild binaries, include primary key only table fixes

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.15.0-next.0
  - @vlcn.io/xplat-api@0.7.0-next.0

## 0.7.4

### Patch Changes

- 64bit rowid support in update hook, fixup cache key calculating for bind args
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.14.3

## 0.7.3

### Patch Changes

- 3d09cd595: preview all the hook improvements and multi db open fixes
- 567d8acba: auto-release prepared statements
- 54666261b: fractional indexing inclusion
- fractional indexing, better react hooks, many dbs opened concurrently
- Updated dependencies [3d09cd595]
- Updated dependencies [567d8acba]
- Updated dependencies [54666261b]
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.14.2
  - @vlcn.io/xplat-api@0.6.2

## 0.7.3-next.2

### Patch Changes

- preview all the hook improvements and multi db open fixes
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.14.2-next.2
  - @vlcn.io/xplat-api@0.6.2-next.2

## 0.7.3-next.1

### Patch Changes

- auto-release prepared statements
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.14.2-next.1
  - @vlcn.io/xplat-api@0.6.2-next.1

## 0.7.3-next.0

### Patch Changes

- fractional indexing inclusion
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.14.2-next.0
  - @vlcn.io/xplat-api@0.6.2-next.0

## 0.7.2

### Patch Changes

- 519bcfc2a: hooks, fixes to support examples, auto-determine tables queried
- hooks package, used_tables query, web only target for wa-sqlite
- Updated dependencies [519bcfc2a]
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.14.1
  - @vlcn.io/xplat-api@0.6.1

## 0.7.2-next.0

### Patch Changes

- hooks, fixes to support examples, auto-determine tables queried
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.14.1-next.0
  - @vlcn.io/xplat-api@0.6.1-next.0

## 0.7.1

### Patch Changes

- accept auth tokens in server impl, fix error case leading to infinite loop in sync server, unbreak esm.sh

## 0.7.0

### Minor Changes

- seen peers, binary encoding for network layer, retry on disconnect for server, auto-track peers

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.14.0
  - @vlcn.io/xplat-api@0.6.0

## 0.6.3

### Patch Changes

- deploy table validation fix
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.13.3
  - @vlcn.io/xplat-api@0.5.3

## 0.6.2

### Patch Changes

- cid winner selection bugfix
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.13.2
  - @vlcn.io/xplat-api@0.5.2

## 0.6.1

### Patch Changes

- rebuild all
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.13.1
  - @vlcn.io/xplat-api@0.5.1

## 0.6.0

### Minor Changes

- breaking change -- fix version recording problem that prevented convergence in p2p cases

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.13.0
  - @vlcn.io/xplat-api@0.5.0

## 0.5.2

### Patch Changes

- fix gh #108
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.12.2

## 0.5.1

### Patch Changes

- fix mem leak and cid win value selection bug
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.12.1
  - @vlcn.io/xplat-api@0.4.1

## 0.5.0

### Minor Changes

- fix tie breaking for merge, add example client-server sync

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.12.0
  - @vlcn.io/xplat-api@0.4.0

## 0.4.2

### Patch Changes

- fix bigint overflow in wasm, fix site_id not being returned with changesets
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.11.2
  - @vlcn.io/xplat-api@0.3.1

## 0.4.1

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.11.1

## 0.4.0

### Minor Changes

- fix multi-way merge

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.11.0
  - @vlcn.io/xplat-api@0.3.0

## 0.3.0

### Minor Changes

- incorporate schema fitness checks

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.10.0

## 0.2.0

### Minor Changes

- update to use `wa-sqlite`, fix site id forwarding, fix scientific notation replication, etc.

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-sqlite@0.9.0
  - @vlcn.io/xplat-api@0.2.0

## 0.1.11

### Patch Changes

- fix linking issues on linux distros
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.8.9
  - @vlcn.io/xplat-api@0.1.5

## 0.1.10

### Patch Changes

- fixes site id not being passed during replication
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.8.8
  - @vlcn.io/xplat-api@0.1.4

## 0.1.9

### Patch Changes

- cache per connection

## 0.1.8

### Patch Changes

- fix statement preparation error in cases where there are multiple concurrent db connections
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.8.7
  - @vlcn.io/xplat-api@0.1.3

## 0.1.7

### Patch Changes

- update sqlite binaries
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.8.6
  - @vlcn.io/xplat-api@0.1.2

## 0.1.6

### Patch Changes

- use `globalThis` not window

## 0.1.5

### Patch Changes

- tx queue to prevent tx within tx

## 0.1.4

### Patch Changes

- include sources in npm packages

## 0.1.3

### Patch Changes

- debug logging, fatal on bad binds
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.8.5

## 0.1.2

### Patch Changes

- allow callers to specify path to wasm

## 0.1.1

### Patch Changes

- remove `link:../` references so we actually correctly resolve packages
- Updated dependencies
  - @vlcn.io/wa-sqlite@0.8.4
  - @vlcn.io/xplat-api@0.1.1

## 0.1.0

### Minor Changes

- first release that works end to end

### Patch Changes

- Updated dependencies
  - @vlcn.io/xplat-api@0.1.0
