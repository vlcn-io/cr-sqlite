#! /bin/bash

for d in ./packages/*/ ; do (cd "$d" && pnpm run test || { echo "Test in $d failed" ; exit 1; }); done