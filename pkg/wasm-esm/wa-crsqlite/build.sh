#! /bin/bash

set -e

mkdir -p dist

cd ../../../deps/wa-sqlite
yarn install

cd ../emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

cd ../wa-sqlite
make

cp dist/wa-sqlite-async.mjs dist/wa-sqlite-async.wasm dist/wa-sqlite.mjs dist/wa-sqlite.wasm ../../pkg/wasm-esm/wa-crsqlite/dist
