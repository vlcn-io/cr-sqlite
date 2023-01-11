# @vlcn.io/sync-client

## 0.6.1

### Patch Changes

- accept auth tokens in server impl, fix error case leading to infinite loop in sync server, unbreak esm.sh
- Updated dependencies
  - @vlcn.io/client-core@0.6.1
  - @vlcn.io/client-server-common@0.3.1

## 0.6.0

### Minor Changes

- seen peers, binary encoding for network layer, retry on disconnect for server, auto-track peers

### Patch Changes

- Updated dependencies
  - @vlcn.io/rx-tbl@0.6.0
  - @vlcn.io/client-core@0.6.0
  - @vlcn.io/client-server-common@0.3.0
  - @vlcn.io/xplat-api@0.6.0

## 0.5.3

### Patch Changes

- deploy table validation fix
- Updated dependencies
  - @vlcn.io/rx-tbl@0.5.3
  - @vlcn.io/client-server-common@0.2.3
  - @vlcn.io/xplat-api@0.5.3

## 0.5.2

### Patch Changes

- cid winner selection bugfix
- Updated dependencies
  - @vlcn.io/rx-tbl@0.5.2
  - @vlcn.io/client-server-common@0.2.2
  - @vlcn.io/xplat-api@0.5.2

## 0.5.1

### Patch Changes

- rebuild all
- Updated dependencies
  - @vlcn.io/rx-tbl@0.5.1
  - @vlcn.io/client-server-common@0.2.1
  - @vlcn.io/xplat-api@0.5.1

## 0.5.0

### Minor Changes

- breaking change -- fix version recording problem that prevented convergence in p2p cases

### Patch Changes

- Updated dependencies
  - @vlcn.io/client-server-common@0.2.0
  - @vlcn.io/rx-tbl@0.5.0
  - @vlcn.io/xplat-api@0.5.0

## 0.4.2

### Patch Changes

- allow messages from the past

## 0.4.1

### Patch Changes

- fix mem leak and cid win value selection bug
- Updated dependencies
  - @vlcn.io/rx-tbl@0.4.1
  - @vlcn.io/client-server-common@0.1.1
  - @vlcn.io/xplat-api@0.4.1

## 0.4.0

### Minor Changes

- fix tie breaking for merge, add example client-server sync

### Patch Changes

- Updated dependencies
  - @vlcn.io/rx-tbl@0.4.0
  - @vlcn.io/client-server-common@0.1.0
  - @vlcn.io/xplat-api@0.4.0
