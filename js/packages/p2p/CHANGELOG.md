# @vlcn.io/replicator-wholedb

## 0.8.0-next.1

### Patch Changes

- npm is not updating on package publish -- bump versions to try to force it
- Updated dependencies
  - @vlcn.io/xplat-api@0.9.0-next.1

## 0.8.0-next.0

### Minor Changes

- ANSI SQL compliance for crsql_changes, all filters available for crsql_changes, removal of tracked_peers, simplified crsql_master table

### Patch Changes

- Updated dependencies
  - @vlcn.io/xplat-api@0.9.0-next.0

## 0.7.3

### Patch Changes

- e5919ae: fix xcommit deadlock, bump versions on dependencies
- Updated dependencies [e5919ae]
  - @vlcn.io/xplat-api@0.8.2

## 0.7.3-next.0

### Patch Changes

- fix xcommit deadlock, bump versions on dependencies
- Updated dependencies
  - @vlcn.io/xplat-api@0.8.2-next.0

## 0.7.2

### Patch Changes

- aad733d: --
- Updated dependencies [aad733d]
  - @vlcn.io/xplat-api@0.8.1

## 0.7.2-next.0

### Patch Changes

---

- Updated dependencies
  - @vlcn.io/xplat-api@0.8.1-next.0

## 0.7.1

### Patch Changes

- Updated dependencies [14c9f4e]
  - @vlcn.io/xplat-api@0.8.0

## 0.7.1-next.0

### Patch Changes

- Updated dependencies
  - @vlcn.io/xplat-api@0.8.0-next.0

## 0.7.0

### Minor Changes

- 6316ec315: update to support prebuild binaries, include primary key only table fixes

### Patch Changes

- Updated dependencies [6316ec315]
  - @vlcn.io/xplat-api@0.7.0

## 0.7.0-next.0

### Minor Changes

- update to support prebuild binaries, include primary key only table fixes

### Patch Changes

- Updated dependencies
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
  - @vlcn.io/xplat-api@0.6.2

## 0.6.3-next.2

### Patch Changes

- preview all the hook improvements and multi db open fixes
- Updated dependencies
  - @vlcn.io/xplat-api@0.6.2-next.2

## 0.6.3-next.1

### Patch Changes

- auto-release prepared statements
- Updated dependencies
  - @vlcn.io/xplat-api@0.6.2-next.1

## 0.6.3-next.0

### Patch Changes

- fractional indexing inclusion
- Updated dependencies
  - @vlcn.io/xplat-api@0.6.2-next.0

## 0.6.2

### Patch Changes

- allow specifying peer server settings

## 0.6.1

### Patch Changes

- 519bcfc2a: hooks, fixes to support examples, auto-determine tables queried
- hooks package, used_tables query, web only target for wa-sqlite
- Updated dependencies [519bcfc2a]
- Updated dependencies
  - @vlcn.io/xplat-api@0.6.1

## 0.6.1-next.0

### Patch Changes

- hooks, fixes to support examples, auto-determine tables queried
- Updated dependencies
  - @vlcn.io/xplat-api@0.6.1-next.0

## 0.6.0

### Minor Changes

- seen peers, binary encoding for network layer, retry on disconnect for server, auto-track peers

### Patch Changes

- Updated dependencies
  - @vlcn.io/xplat-api@0.6.0

## 0.5.3

### Patch Changes

- deploy table validation fix
- Updated dependencies
  - @vlcn.io/xplat-api@0.5.3

## 0.5.2

### Patch Changes

- cid winner selection bugfix
- Updated dependencies
  - @vlcn.io/xplat-api@0.5.2

## 0.5.1

### Patch Changes

- rebuild all
- Updated dependencies
  - @vlcn.io/xplat-api@0.5.1

## 0.5.0

### Minor Changes

- breaking change -- fix version recording problem that prevented convergence in p2p cases

### Patch Changes

- Updated dependencies
  - @vlcn.io/xplat-api@0.5.0

## 0.4.1

### Patch Changes

- fix mem leak and cid win value selection bug
- Updated dependencies
  - @vlcn.io/xplat-api@0.4.1

## 0.4.0

### Minor Changes

- fix tie breaking for merge, add example client-server sync

### Patch Changes

- Updated dependencies
  - @vlcn.io/xplat-api@0.4.0

## 0.3.1

### Patch Changes

- fix bigint overflow in wasm, fix site_id not being returned with changesets
- Updated dependencies
  - @vlcn.io/xplat-api@0.3.1

## 0.3.0

### Minor Changes

- fix multi-way merge

### Patch Changes

- Updated dependencies
  - @vlcn.io/xplat-api@0.3.0

## 0.2.0

### Minor Changes

- update to use `wa-sqlite`, fix site id forwarding, fix scientific notation replication, etc.

### Patch Changes

- Updated dependencies
  - @vlcn.io/xplat-api@0.2.0

## 0.1.8

### Patch Changes

- fix linking issues on linux distros
- Updated dependencies
  - @vlcn.io/xplat-api@0.1.5

## 0.1.7

### Patch Changes

- fixes site id not being passed during replication
- Updated dependencies
  - @vlcn.io/xplat-api@0.1.4

## 0.1.6

### Patch Changes

- fix statement preparation error in cases where there are multiple concurrent db connections
- Updated dependencies
  - @vlcn.io/xplat-api@0.1.3

## 0.1.5

### Patch Changes

- update sqlite binaries
- Updated dependencies
  - @vlcn.io/xplat-api@0.1.2

## 0.1.4

### Patch Changes

- use `globalThis` not window

## 0.1.3

### Patch Changes

- include sources in npm packages

## 0.1.2

### Patch Changes

- debug logging, fatal on bad binds

## 0.1.1

### Patch Changes

- remove `link:../` references so we actually correctly resolve packages
- Updated dependencies
  - @vlcn.io/xplat-api@0.1.1

## 0.1.0

### Minor Changes

- first release that works end to end

### Patch Changes

- Updated dependencies
  - @vlcn.io/xplat-api@0.1.0
