# @vlcn.io/browser-tests

## 0.5.1

### Patch Changes

- rebuild all
- Updated dependencies
  - @vlcn.io/wa-crsqlite@0.6.1
  - @vlcn.io/xplat-tests@0.5.1

## 0.5.0

### Minor Changes

- breaking change -- fix version recording problem that prevented convergence in p2p cases

### Patch Changes

- Updated dependencies
  - @vlcn.io/xplat-tests@0.5.0
  - @vlcn.io/wa-crsqlite@0.6.0

## 0.4.2

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-crsqlite@0.5.2

## 0.4.1

### Patch Changes

- fix mem leak and cid win value selection bug
- Updated dependencies
  - @vlcn.io/wa-crsqlite@0.5.1
  - @vlcn.io/xplat-tests@0.4.1

## 0.4.0

### Minor Changes

- fix tie breaking for merge, add example client-server sync

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-crsqlite@0.5.0
  - @vlcn.io/xplat-tests@0.4.0

## 0.3.2

### Patch Changes

- fix bigint overflow in wasm, fix site_id not being returned with changesets
- Updated dependencies
  - @vlcn.io/wa-crsqlite@0.4.2
  - @vlcn.io/xplat-tests@0.3.1

## 0.3.1

### Patch Changes

- @vlcn.io/wa-crsqlite@0.4.1

## 0.3.0

### Minor Changes

- fix multi-way merge

### Patch Changes

- Updated dependencies
  - @vlcn.io/xplat-tests@0.3.0
  - @vlcn.io/wa-crsqlite@0.4.0

## 0.2.1

### Patch Changes

- Updated dependencies
  - @vlcn.io/wa-crsqlite@0.3.0

## 0.2.0

### Minor Changes

- update to use `wa-sqlite`, fix site id forwarding, fix scientific notation replication, etc.

### Patch Changes

- Updated dependencies
  - @vlcn.io/xplat-tests@0.2.0
  - @vlcn.io/wa-crsqlite@0.2.0

## 0.1.9

### Patch Changes

- Updated dependencies
  - @vlcn.io/crsqlite-wasm@0.2.0

## 0.1.8

### Patch Changes

- fix linking issues on linux distros
- Updated dependencies
  - @vlcn.io/xplat-tests@0.1.8
  - @vlcn.io/crsqlite-wasm@0.1.5

## 0.1.7

### Patch Changes

- fixes site id not being passed during replication
- Updated dependencies
  - @vlcn.io/xplat-tests@0.1.7
  - @vlcn.io/crsqlite-wasm@0.1.4

## 0.1.6

### Patch Changes

- fix statement preparation error in cases where there are multiple concurrent db connections
- Updated dependencies
  - @vlcn.io/xplat-tests@0.1.6
  - @vlcn.io/crsqlite-wasm@0.1.3

## 0.1.5

### Patch Changes

- update sqlite binaries
- Updated dependencies
  - @vlcn.io/xplat-tests@0.1.5
  - @vlcn.io/crsqlite-wasm@0.1.2

## 0.1.4

### Patch Changes

- @vlcn.io/xplat-tests@0.1.4

## 0.1.3

### Patch Changes

- @vlcn.io/xplat-tests@0.1.3

## 0.1.2

### Patch Changes

- @vlcn.io/xplat-tests@0.1.2

## 0.1.1

### Patch Changes

- remove `link:../` references so we actually correctly resolve packages
- Updated dependencies
  - @vlcn.io/xplat-tests@0.1.1
  - @vlcn.io/crsqlite-wasm@0.1.1

## 0.1.0

### Minor Changes

- first release that works end to end

### Patch Changes

- Updated dependencies [1dc0215]
- Updated dependencies
  - @vlcn.io/crsqlite-wasm@0.1.0
  - @vlcn.io/xplat-tests@0.1.0
