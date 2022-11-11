#! /bin/bash

set -e

mkdir -p dist

cd ../wa-sqlite
pnpm install

cd ../../../depsemsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

cd ../wa-sqlite
make

cp dist/wa-sqlite-async.wasm ../wa-crsqlite/dist
# cp dist/wa-sqlite-async.mjs  ../../pkg/wasm-esm/wa-crsqlite/src/wa-sqlite-async.js
