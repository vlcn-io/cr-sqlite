#! /bin/bash

# todo: move this to make

# Update what we depend on
git submodule update --init --recursive
pnpm install

# make the native loadable extension
cd native/src
make loadable

# make npm packages
cd ../../js/wasm-esm/wa-crsqlite
./build.sh

# currently not using the official wasm build.
# cd ../crsqlite
# ./build.sh

cd ../../tsbuild-all
pnpm build