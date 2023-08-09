# @vlcn.io/direct-connect-browser

## 0.5.0-next.0

### Minor Changes

- re-insertion, api naming consistencies, metadata size reduction, websocket server, websocket client, websocket demo

### Patch Changes

- Updated dependencies
  - @vlcn.io/direct-connect-common@0.6.0-next.0
  - @vlcn.io/crsqlite-wasm@0.15.0-next.0
  - @vlcn.io/rx-tbl@0.14.0-next.0
  - @vlcn.io/xplat-api@0.14.0-next.0

## 0.4.0

### Minor Changes

- 68deb1c: binary encoded primary keys, no string encoding on values, cache prepared statements on merge, fix webkit JIT crash

### Patch Changes

- Updated dependencies [4f916e2]
- Updated dependencies [68deb1c]
  - @vlcn.io/direct-connect-common@0.5.0
  - @vlcn.io/crsqlite-wasm@0.14.0
  - @vlcn.io/rx-tbl@0.13.0
  - @vlcn.io/xplat-api@0.13.0

## 0.4.0-next.1

### Patch Changes

- Updated dependencies
  - @vlcn.io/direct-connect-common@0.5.0-next.1

## 0.4.0-next.0

### Minor Changes

- binary encoded primary keys, no string encoding on values, cache prepared statements on merge, fix webkit JIT crash

### Patch Changes

- Updated dependencies
  - @vlcn.io/crsqlite-wasm@0.14.0-next.0
  - @vlcn.io/direct-connect-common@0.5.0-next.0
  - @vlcn.io/rx-tbl@0.13.0-next.0
  - @vlcn.io/xplat-api@0.13.0-next.0

## 0.3.0

### Minor Changes

- 62912ad: split up large transactions, compact out unneeded delete records, coordinate dedicated workers for android, null merge fix

### Patch Changes

- Updated dependencies [62912ad]
  - @vlcn.io/crsqlite-wasm@0.13.0
  - @vlcn.io/direct-connect-common@0.4.0
  - @vlcn.io/rx-tbl@0.12.0
  - @vlcn.io/xplat-api@0.12.0

## 0.3.0-next.0

### Minor Changes

- split up large transactions, compact out unneeded delete records, coordinate dedicated workers for android, null merge fix

### Patch Changes

- Updated dependencies
  - @vlcn.io/crsqlite-wasm@0.13.0-next.0
  - @vlcn.io/direct-connect-common@0.4.0-next.0
  - @vlcn.io/rx-tbl@0.12.0-next.0
  - @vlcn.io/xplat-api@0.12.0-next.0

## 0.2.0

### Minor Changes

- 7885afd: 50x perf boost when pulling changesets

### Patch Changes

- Updated dependencies [7885afd]
  - @vlcn.io/crsqlite-wasm@0.12.0
  - @vlcn.io/direct-connect-common@0.3.0
  - @vlcn.io/rx-tbl@0.11.0
  - @vlcn.io/xplat-api@0.11.0

## 0.2.0-next.0

### Minor Changes

- 15c8e04: 50x perf boost when pulling changesets

### Patch Changes

- Updated dependencies [15c8e04]
  - @vlcn.io/crsqlite-wasm@0.12.0-next.0
  - @vlcn.io/direct-connect-common@0.3.0-next.0
  - @vlcn.io/rx-tbl@0.11.0-next.0
  - @vlcn.io/xplat-api@0.11.0-next.0

## 0.1.0

### Minor Changes

- automigrate fixes for WASM, react fixes for referential equality, direct-connect networking implementations, sync in shared worker, dbProvider hooks for React

### Patch Changes

- 5aecbb6: re-introduce passing of worker and wasm urls
- c81b7d5: optional wasm and worker uris
- 2d17a8e: filter bug
- 4e737a0: better error reporting on migration failure, handle schema swap
- 62934ad: thread wasm uri down to worker
- Updated dependencies
- Updated dependencies [4e737a0]
  - @vlcn.io/crsqlite-wasm@0.11.0
  - @vlcn.io/direct-connect-common@0.2.0
  - @vlcn.io/rx-tbl@0.10.0
  - @vlcn.io/xplat-api@0.10.0

## 0.0.7-next.5

### Patch Changes

- filter bug

## 0.0.7-next.4

### Patch Changes

- thread wasm uri down to worker

## 0.0.7-next.3

### Patch Changes

- optional wasm and worker uris

## 0.0.7-next.2

### Patch Changes

- re-introduce passing of worker and wasm urls

## 0.0.7-next.0

### Patch Changes

- better error reporting on migration failure, handle schema swap
- Updated dependencies
  - @vlcn.io/crsqlite-wasm@0.10.2-next.0

## 0.0.6

### Patch Changes

- remove some cosonle.logs, add utility state hooks

## 0.0.5

### Patch Changes

- restart connect on version mismatch

## 0.0.4

### Patch Changes

- vite workaround so worker works in both prod and dev mode

## 0.0.3

### Patch Changes

- include the worker in such a way that vite understands

## 0.0.2

### Patch Changes

- fts5, sqlite 3.42.1, direct-connect packages
- Updated dependencies [6dbfdcb]
- Updated dependencies
  - @vlcn.io/crsqlite-wasm@0.10.1
  - @vlcn.io/direct-connect-common@0.1.1
  - @vlcn.io/rx-tbl@0.9.1
  - @vlcn.io/xplat-api@0.9.1
