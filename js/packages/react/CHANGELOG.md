# @vlcn.io/react

## 2.5.0-next.0

### Minor Changes

- re-insertion, api naming consistencies, metadata size reduction, websocket server, websocket client, websocket demo

### Patch Changes

- Updated dependencies
  - @vlcn.io/direct-connect-browser@0.5.0-next.0
  - @vlcn.io/crsqlite-wasm@0.15.0-next.0
  - @vlcn.io/rx-tbl@0.14.0-next.0
  - @vlcn.io/xplat-api@0.14.0-next.0

## 2.4.0

### Minor Changes

- 68deb1c: binary encoded primary keys, no string encoding on values, cache prepared statements on merge, fix webkit JIT crash

### Patch Changes

- Updated dependencies [68deb1c]
  - @vlcn.io/crsqlite-wasm@0.14.0
  - @vlcn.io/direct-connect-browser@0.4.0
  - @vlcn.io/rx-tbl@0.13.0
  - @vlcn.io/xplat-api@0.13.0

## 2.4.0-next.1

### Patch Changes

- @vlcn.io/direct-connect-browser@0.4.0-next.1

## 2.4.0-next.0

### Minor Changes

- binary encoded primary keys, no string encoding on values, cache prepared statements on merge, fix webkit JIT crash

### Patch Changes

- Updated dependencies
  - @vlcn.io/crsqlite-wasm@0.14.0-next.0
  - @vlcn.io/direct-connect-browser@0.4.0-next.0
  - @vlcn.io/rx-tbl@0.13.0-next.0
  - @vlcn.io/xplat-api@0.13.0-next.0

## 2.3.0

### Minor Changes

- 62912ad: split up large transactions, compact out unneeded delete records, coordinate dedicated workers for android, null merge fix

### Patch Changes

- Updated dependencies [62912ad]
  - @vlcn.io/crsqlite-wasm@0.13.0
  - @vlcn.io/direct-connect-browser@0.3.0
  - @vlcn.io/rx-tbl@0.12.0
  - @vlcn.io/xplat-api@0.12.0

## 2.3.0-next.0

### Minor Changes

- split up large transactions, compact out unneeded delete records, coordinate dedicated workers for android, null merge fix

### Patch Changes

- Updated dependencies
  - @vlcn.io/crsqlite-wasm@0.13.0-next.0
  - @vlcn.io/direct-connect-browser@0.3.0-next.0
  - @vlcn.io/rx-tbl@0.12.0-next.0
  - @vlcn.io/xplat-api@0.12.0-next.0

## 2.2.0

### Minor Changes

- 7885afd: 50x perf boost when pulling changesets

### Patch Changes

- Updated dependencies [7885afd]
  - @vlcn.io/crsqlite-wasm@0.12.0
  - @vlcn.io/direct-connect-browser@0.2.0
  - @vlcn.io/rx-tbl@0.11.0
  - @vlcn.io/xplat-api@0.11.0

## 2.2.0-next.0

### Minor Changes

- 15c8e04: 50x perf boost when pulling changesets

### Patch Changes

- Updated dependencies [15c8e04]
  - @vlcn.io/crsqlite-wasm@0.12.0-next.0
  - @vlcn.io/direct-connect-browser@0.2.0-next.0
  - @vlcn.io/rx-tbl@0.11.0-next.0
  - @vlcn.io/xplat-api@0.11.0-next.0

## 2.1.0

### Minor Changes

- automigrate fixes for WASM, react fixes for referential equality, direct-connect networking implementations, sync in shared worker, dbProvider hooks for React

### Patch Changes

- 5aecbb6: re-introduce passing of worker and wasm urls
- c81b7d5: optional wasm and worker uris
- 62934ad: thread wasm uri down to worker
- Updated dependencies [5aecbb6]
- Updated dependencies
- Updated dependencies [c81b7d5]
- Updated dependencies [2d17a8e]
- Updated dependencies [4e737a0]
- Updated dependencies [62934ad]
  - @vlcn.io/direct-connect-browser@0.1.0
  - @vlcn.io/crsqlite-wasm@0.11.0
  - @vlcn.io/rx-tbl@0.10.0
  - @vlcn.io/xplat-api@0.10.0

## 0.10.3-next.4

### Patch Changes

- Updated dependencies
  - @vlcn.io/direct-connect-browser@0.0.7-next.5

## 0.10.3-next.3

### Patch Changes

- thread wasm uri down to worker
- Updated dependencies
  - @vlcn.io/direct-connect-browser@0.0.7-next.4

## 0.10.3-next.2

### Patch Changes

- optional wasm and worker uris
- Updated dependencies
  - @vlcn.io/direct-connect-browser@0.0.7-next.3

## 0.10.3-next.1

### Patch Changes

- re-introduce passing of worker and wasm urls
- Updated dependencies
  - @vlcn.io/direct-connect-browser@0.0.7-next.1

## 0.10.2

### Patch Changes

- remove some cosonle.logs, add utility state hooks

## 0.10.1

### Patch Changes

- fts5, sqlite 3.42.1, direct-connect packages
- Updated dependencies
  - @vlcn.io/rx-tbl@0.9.1
  - @vlcn.io/xplat-api@0.9.1

## 0.10.0

### Minor Changes

- e0de95c: ANSI SQL compliance for crsql_changes, all filters available for crsql_changes, removal of tracked_peers, simplified crsql_master table

### Patch Changes

- 9b483aa: npm is not updating on package publish -- bump versions to try to force it
- Updated dependencies [9b483aa]
- Updated dependencies [e0de95c]
  - @vlcn.io/xplat-api@0.9.0
  - @vlcn.io/rx-tbl@0.9.0

## 0.10.0-next.1

### Patch Changes

- npm is not updating on package publish -- bump versions to try to force it
- Updated dependencies
  - @vlcn.io/xplat-api@0.9.0-next.1
  - @vlcn.io/rx-tbl@0.9.0-next.1

## 0.10.0-next.0

### Minor Changes

- ANSI SQL compliance for crsql_changes, all filters available for crsql_changes, removal of tracked_peers, simplified crsql_master table

### Patch Changes

- Updated dependencies
  - @vlcn.io/rx-tbl@0.9.0-next.0
  - @vlcn.io/xplat-api@0.9.0-next.0

## 0.9.3

### Patch Changes

- e5919ae: fix xcommit deadlock, bump versions on dependencies
- Updated dependencies [e5919ae]
  - @vlcn.io/rx-tbl@0.8.3
  - @vlcn.io/xplat-api@0.8.2

## 0.9.3-next.0

### Patch Changes

- fix xcommit deadlock, bump versions on dependencies
- Updated dependencies
  - @vlcn.io/rx-tbl@0.8.3-next.0
  - @vlcn.io/xplat-api@0.8.2-next.0

## 0.9.2

### Patch Changes

- 68ac663: comply with react strict mode
- Updated dependencies [c1ae5e3]
- Updated dependencies [68ac663]
  - @vlcn.io/rx-tbl@0.8.2

## 0.9.2-next.1

### Patch Changes

- comply with react strict mode
- Updated dependencies
  - @vlcn.io/rx-tbl@0.8.2-next.1

## 0.9.2-next.0

### Patch Changes

- Updated dependencies
  - @vlcn.io/rx-tbl@0.8.2-next.0

## 0.9.1

### Patch Changes

- aad733d: --
- Updated dependencies [aad733d]
  - @vlcn.io/rx-tbl@0.8.1
  - @vlcn.io/xplat-api@0.8.1

## 0.9.1-next.0

### Patch Changes

---

- Updated dependencies
  - @vlcn.io/rx-tbl@0.8.1-next.0
  - @vlcn.io/xplat-api@0.8.1-next.0

## 0.9.0

### Minor Changes

- 14c9f4e: useQuery perf updates, primary key only table fixes, sync in a background worker

### Patch Changes

- Updated dependencies [14c9f4e]
  - @vlcn.io/rx-tbl@0.8.0
  - @vlcn.io/xplat-api@0.8.0

## 0.9.0-next.0

### Minor Changes

- useQuery perf updates, primary key only table fixes, sync in a background worker

### Patch Changes

- Updated dependencies
  - @vlcn.io/rx-tbl@0.8.0-next.0
  - @vlcn.io/xplat-api@0.8.0-next.0

## 0.8.0

### Minor Changes

- 6316ec315: update to support prebuild binaries, include primary key only table fixes

### Patch Changes

- Updated dependencies [6316ec315]
  - @vlcn.io/rx-tbl@0.7.0
  - @vlcn.io/xplat-api@0.7.0

## 0.8.0-next.0

### Minor Changes

- update to support prebuild binaries, include primary key only table fixes

### Patch Changes

- Updated dependencies
  - @vlcn.io/rx-tbl@0.7.0-next.0
  - @vlcn.io/xplat-api@0.7.0-next.0

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
  - @vlcn.io/rx-tbl@0.6.2
  - @vlcn.io/xplat-api@0.6.2

## 0.7.3-next.2

### Patch Changes

- preview all the hook improvements and multi db open fixes
- Updated dependencies
  - @vlcn.io/rx-tbl@0.6.2-next.2
  - @vlcn.io/xplat-api@0.6.2-next.2

## 0.7.3-next.1

### Patch Changes

- auto-release prepared statements
- Updated dependencies
  - @vlcn.io/rx-tbl@0.6.2-next.1
  - @vlcn.io/xplat-api@0.6.2-next.1

## 0.7.3-next.0

### Patch Changes

- fractional indexing inclusion
- Updated dependencies
  - @vlcn.io/rx-tbl@0.6.2-next.0
  - @vlcn.io/xplat-api@0.6.2-next.0

## 0.7.2

### Patch Changes

- 519bcfc2a: hooks, fixes to support examples, auto-determine tables queried
- hooks package, used_tables query, web only target for wa-sqlite
- Updated dependencies [519bcfc2a]
- Updated dependencies
  - @vlcn.io/rx-tbl@0.6.1
  - @vlcn.io/xplat-api@0.6.1

## 0.7.2-next.0

### Patch Changes

- hooks, fixes to support examples, auto-determine tables queried
- Updated dependencies
  - @vlcn.io/rx-tbl@0.6.1-next.0
  - @vlcn.io/xplat-api@0.6.1-next.0
