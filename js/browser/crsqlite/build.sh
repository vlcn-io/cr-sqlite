#! /bin/bash

mkdir -p dist

# Setup sqlite
cd ../../../deps/sqlite

./configure --enable-all
make sqlite3.c

# Setup emsdk
cd ../emsdk/
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

# Build the wasm targets
cd ../sqlite/ext/wasm
make crsqlite-extra
make dist

cp jswasm/sqlite3.wasm jswasm/sqlite3-opfs-async-proxy.js ../../../../js/browser/crsqlite/dist
cp jswasm/sqlite3.js ../../../../js/browser/crsqlite/src
