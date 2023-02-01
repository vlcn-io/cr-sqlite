# @vlcn.io/xplat-api

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
