# @vlcn.io/crsqlite-wasm

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

## 0.5.4

### Patch Changes

- re-enable the official sqlite build with crsqlite

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

- require explicit file locators

## 0.1.5

### Patch Changes

- fix linking issues on linux distros
- Updated dependencies
  - @vlcn.io/xplat-api@0.1.5

## 0.1.4

### Patch Changes

- fixes site id not being passed during replication
- Updated dependencies
  - @vlcn.io/xplat-api@0.1.4

## 0.1.3

### Patch Changes

- fix statement preparation error in cases where there are multiple concurrent db connections
- Updated dependencies
  - @vlcn.io/xplat-api@0.1.3

## 0.1.2

### Patch Changes

- update sqlite binaries
- Updated dependencies
  - @vlcn.io/xplat-api@0.1.2

## 0.1.1

### Patch Changes

- remove `link:../` references so we actually correctly resolve packages
- Updated dependencies
  - @vlcn.io/xplat-api@0.1.1

## 0.1.0

### Minor Changes

- first release that works end to end

### Patch Changes

- 1dc0215: fixup exports
- Updated dependencies
  - @vlcn.io/xplat-api@0.1.0
