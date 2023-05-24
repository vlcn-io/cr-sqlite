#!/usr/bin/env bash

declare -a pkgs=(
  "@vlcn.io/create"
  "@vlcn.io/crsqlite-wasm"
  "@vlcn.io/crsqlite-allinone"
  "@vlcn.io/sync-p2p"
  "@vlcn.io/react"
  "@vlcn.io/direct-connect-browser"
  "@vlcn.io/direct-connect-common"
  "@vlcn.io/direct-connect-nodejs"
  "@vlcn.io/rx-tbl"
  "@vlcn.io/xplat-api"
  "@vlcn.io/wa-sqlite"
)

# Loop through each input package
# for PACKAGE in "${pkgs[@]}"; do
#     # Fetch the latest version of the package
#     LATEST_VERSION=$(npm show "$PACKAGE" version)
#     echo "$PACKAGE:$LATEST_VERSION"
# done

printf '%s\n' "${pkgs[@]}" | xargs -I {} -P 8 bash -c 'echo "{}:$(npm show {} version)"'