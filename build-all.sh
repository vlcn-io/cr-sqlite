#! /bin/bash

# todo: move this to make

# Update what we depend on
git submodule update --recursive

# Update x-plat build for native lib
npm install

# make the standard loadable extension
cd native/src
make loadable

# make npm packages
cd ../js
pnpm install

cd wasm-esm/wa-crsqlite
./build.sh

cd ../crsqlite
./build.sh

cd ../../tsbuild-all
pnpm build