#! /bin/bash

# todo: move this to make

# Update what we depend on
git submodule update --recursive

# Update x-plat build for native lib
npm install

cd src
make loadable

cd ../pkg
pnpm install

cd wasm-esm/wa-crsqlite
./build.sh

cd ../crsqlite
./build.sh

cd ../../tsbuild-all
pnpm build