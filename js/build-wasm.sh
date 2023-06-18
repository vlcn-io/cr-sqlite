#! /bin/bash

# cargo clean in core/rs/bundle

mkdir -p packages/crsqlite-wasm/dist
cd deps/emsdk
./emsdk install 3.1.40
./emsdk activate 3.1.40
source ./emsdk_env.sh
cd ../wa-sqlite
make
cp dist/crsqlite.wasm ../../packages/crsqlite-wasm/dist/crsqlite.wasm
cp dist/crsqlite.mjs ../../packages/crsqlite-wasm/src/crsqlite.mjs
