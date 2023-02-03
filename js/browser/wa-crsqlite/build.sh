#! /bin/bash

mkdir -p dist

cd ../../../deps/emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

cd ../wa-sqlite
make

cp dist/wa-sqlite-async.wasm ../../js/browser/wa-crsqlite/dist
cp dist/wa-sqlite-async.mjs ../../js/browser/wa-crsqlite/src

# cp debug/wa-sqlite-async.wasm ../../js/browser/wa-crsqlite/dist
# cp debug/wa-sqlite-async.mjs ../../js/browser/wa-crsqlite/src