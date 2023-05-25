#!/usr/bin/env bash

pkgs=""
if [[ $1 == "local" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
  source "$SCRIPT_DIR/pkgs.inc.sh"
  pkgs=("${pkgslocal[@]}")
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
  pkgs=($("$SCRIPT_DIR/latest-versions.sh"))
fi

for pkg in "${pkgs[@]}"; do
  echo "processing $pkg"
  IFS=':' read -r NAME VERSION <<< "$pkg"
  PACKAGE_EXISTS=$(jq -r --arg name "$NAME" '.dependencies | has($name)' package.json)
  if [ "$PACKAGE_EXISTS" = "true" ]; then
    if [[ $1 == "local" ]]; then
      VERSION="link:$VERSION"
    fi
    # replace in package.json only if there is an entry for that package in the package.json
    jq --arg name "$NAME" --arg version "$VERSION" '.dependencies[$name] = $version' package.json > tmp.json && mv tmp.json package.json
  fi
done
