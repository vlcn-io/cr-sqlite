# @vlcn.io/node-tests

## 0.3.3

### Patch Changes

- fix bigint overflow in wasm, fix site_id not being returned with changesets
- Updated dependencies
  - @vlcn.io/crsqlite@0.4.2

## 0.3.2

### Patch Changes

- bump better-sqlite3 version

## 0.3.1

### Patch Changes

- Updated dependencies
  - @vlcn.io/crsqlite@0.4.1

## 0.3.0

### Minor Changes

- fix multi-way merge

### Patch Changes

- Updated dependencies
  - @vlcn.io/crsqlite@0.4.0

## 0.2.1

### Patch Changes

- Updated dependencies
  - @vlcn.io/crsqlite@0.3.0

## 0.2.0

### Minor Changes

- update to use `wa-sqlite`, fix site id forwarding, fix scientific notation replication, etc.

### Patch Changes

- Updated dependencies
  - @vlcn.io/crsqlite@0.2.0

## 0.1.5

### Patch Changes

- fix linking issues on linux distros
- Updated dependencies
  - @vlcn.io/crsqlite@0.1.8

## 0.1.4

### Patch Changes

- fixes site id not being passed during replication
- Updated dependencies
  - @vlcn.io/crsqlite@0.1.7

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
