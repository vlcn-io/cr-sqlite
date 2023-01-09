# @vlcn.io/replicator-wholedb

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
