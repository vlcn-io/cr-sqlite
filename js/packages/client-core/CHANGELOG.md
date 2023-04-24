# @vlcn.io/client-core

## 0.9.0-next.1

### Patch Changes

- npm is not updating on package publish -- bump versions to try to force it
- Updated dependencies
  - @vlcn.io/client-server-common@0.6.0-next.1
  - @vlcn.io/xplat-api@0.9.0-next.1

## 0.9.0-next.0

### Minor Changes

- ANSI SQL compliance for crsql_changes, all filters available for crsql_changes, removal of tracked_peers, simplified crsql_master table

### Patch Changes

- Updated dependencies
  - @vlcn.io/client-server-common@0.6.0-next.0
  - @vlcn.io/xplat-api@0.9.0-next.0

## 0.8.2

### Patch Changes

- e5919ae: fix xcommit deadlock, bump versions on dependencies
- Updated dependencies [e5919ae]
  - @vlcn.io/client-server-common@0.5.2
  - @vlcn.io/xplat-api@0.8.2

## 0.8.2-next.0

### Patch Changes

- fix xcommit deadlock, bump versions on dependencies
- Updated dependencies
  - @vlcn.io/client-server-common@0.5.2-next.0
  - @vlcn.io/xplat-api@0.8.2-next.0

## 0.8.1

### Patch Changes

- aad733d: --
- Updated dependencies [aad733d]
  - @vlcn.io/client-server-common@0.5.1
  - @vlcn.io/xplat-api@0.8.1

## 0.8.1-next.0

### Patch Changes

---

- Updated dependencies
  - @vlcn.io/client-server-common@0.5.1-next.0
  - @vlcn.io/xplat-api@0.8.1-next.0

## 0.8.0

### Minor Changes

- 14c9f4e: useQuery perf updates, primary key only table fixes, sync in a background worker

### Patch Changes

- Updated dependencies [14c9f4e]
  - @vlcn.io/client-server-common@0.5.0
  - @vlcn.io/xplat-api@0.8.0

## 0.8.0-next.0

### Minor Changes

- useQuery perf updates, primary key only table fixes, sync in a background worker

### Patch Changes

- Updated dependencies
  - @vlcn.io/client-server-common@0.5.0-next.0
  - @vlcn.io/xplat-api@0.8.0-next.0

## 0.7.0

### Minor Changes

- 6316ec315: update to support prebuild binaries, include primary key only table fixes

### Patch Changes

- Updated dependencies [6316ec315]
  - @vlcn.io/rx-tbl@0.7.0
  - @vlcn.io/client-server-common@0.4.0
  - @vlcn.io/xplat-api@0.7.0

## 0.7.0-next.0

### Minor Changes

- update to support prebuild binaries, include primary key only table fixes

### Patch Changes

- Updated dependencies
  - @vlcn.io/rx-tbl@0.7.0-next.0
  - @vlcn.io/client-server-common@0.4.0-next.0
  - @vlcn.io/xplat-api@0.7.0-next.0

## 0.6.3

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
  - @vlcn.io/client-server-common@0.3.3
  - @vlcn.io/xplat-api@0.6.2

## 0.6.3-next.2

### Patch Changes

- preview all the hook improvements and multi db open fixes
- Updated dependencies
  - @vlcn.io/rx-tbl@0.6.2-next.2
  - @vlcn.io/client-server-common@0.3.3-next.2
  - @vlcn.io/xplat-api@0.6.2-next.2

## 0.6.3-next.1

### Patch Changes

- auto-release prepared statements
- Updated dependencies
  - @vlcn.io/rx-tbl@0.6.2-next.1
  - @vlcn.io/client-server-common@0.3.3-next.1
  - @vlcn.io/xplat-api@0.6.2-next.1

## 0.6.3-next.0

### Patch Changes

- fractional indexing inclusion
- Updated dependencies
  - @vlcn.io/rx-tbl@0.6.2-next.0
  - @vlcn.io/client-server-common@0.3.3-next.0
  - @vlcn.io/xplat-api@0.6.2-next.0

## 0.6.2

### Patch Changes

- 519bcfc2a: hooks, fixes to support examples, auto-determine tables queried
- hooks package, used_tables query, web only target for wa-sqlite
- Updated dependencies [519bcfc2a]
- Updated dependencies
  - @vlcn.io/rx-tbl@0.6.1
  - @vlcn.io/client-server-common@0.3.2
  - @vlcn.io/xplat-api@0.6.1

## 0.6.2-next.0

### Patch Changes

- hooks, fixes to support examples, auto-determine tables queried
- Updated dependencies
  - @vlcn.io/rx-tbl@0.6.1-next.0
  - @vlcn.io/client-server-common@0.3.2-next.0
  - @vlcn.io/xplat-api@0.6.1-next.0

## 0.6.1

### Patch Changes

- accept auth tokens in server impl, fix error case leading to infinite loop in sync server, unbreak esm.sh
- Updated dependencies
  - @vlcn.io/client-server-common@0.3.1

## 0.6.0

### Minor Changes

- seen peers, binary encoding for network layer, retry on disconnect for server, auto-track peers

### Patch Changes

- Updated dependencies
  - @vlcn.io/rx-tbl@0.6.0
  - @vlcn.io/client-server-common@0.3.0
  - @vlcn.io/xplat-api@0.6.0
