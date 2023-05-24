#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
source "$SCRIPT_DIR/pkgs.inc.sh"

printf '%s\n' "${pkgs[@]}" | xargs -I {} -P 8 bash -c 'echo "{}:$(npm show {} versions --json | jq -r '.[-1]')"'
