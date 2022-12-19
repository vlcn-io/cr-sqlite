#! /bin/bash

# todo: move this to make

# Update what we depend on
# --init
git submodule update --recursive
pnpm install

# make the native loadable extension
cd core
make loadable

# make npm packages
cd ../js/browser/wa-crsqlite
bash ./build.sh

# cd ../crsqlite
# bash ./build.sh

cd ../../tsbuild-all
pnpm build
