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

# two packages have directory names mismatched with package names hence this array.
declare -a pkgslocal=(
  "@vlcn.io/create:../crsqlite/js/packages/create"
  "@vlcn.io/crsqlite-wasm:../crsqlite/js/packages/crsqlite-wasm"
  "@vlcn.io/crsqlite-allinone:../crsqlite/js/packages/node-allinone"
  "@vlcn.io/sync-p2p:../crsqlite/js/packages/p2p"
  "@vlcn.io/react:../crsqlite/js/packages/react"
  "@vlcn.io/direct-connect-browser:../crsqlite/js/packages/direct-connect-browser"
  "@vlcn.io/direct-connect-common:../crsqlite/js/packages/direct-connect-common"
  "@vlcn.io/direct-connect-nodejs:../crsqlite/js/packages/direct-connect-nodejs"
  "@vlcn.io/rx-tbl:../crsqlite/js/packages/rx-tbl"
  "@vlcn.io/xplat-api:../crsqlite/js/packages/xplat-api"
  "@vlcn.io/wa-sqlite:../crsqlite/js/packages/wa-sqlite"
)
