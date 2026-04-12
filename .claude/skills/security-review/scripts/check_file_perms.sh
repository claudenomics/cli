#!/usr/bin/env bash
# Verify perms on session/state files of an installed CLI.
# Usage: check_file_perms.sh <path-to-file-or-dir> [<more> ...]
# Exits non-zero if any file is too permissive (>0600) or any dir is too permissive (>0700).
set -uo pipefail

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <path> [<path> ...]" >&2
    exit 2
fi

fail=0
uname_s=$(uname -s)

stat_mode() {
    case "$uname_s" in
        Darwin|*BSD) stat -f '%Lp' "$1" ;;
        Linux)       stat -c '%a'  "$1" ;;
        *) echo "unsupported OS: $uname_s" >&2; exit 2 ;;
    esac
}
stat_owner() {
    case "$uname_s" in
        Darwin|*BSD) stat -f '%Su:%Sg' "$1" ;;
        Linux)       stat -c '%U:%G'   "$1" ;;
    esac
}

check() {
    local p="$1"
    if [ ! -e "$p" ] && [ ! -L "$p" ]; then
        echo "MISSING $p"
        return
    fi
    local mode owner
    mode=$(stat_mode "$p")
    owner=$(stat_owner "$p")
    if [ -L "$p" ]; then
        local target
        target=$(readlink "$p")
        echo "SYMLINK $p -> $target  (mode=$mode owner=$owner)  [SUSPICIOUS]"
        fail=1
    elif [ -d "$p" ]; then
        if [ "$mode" != "700" ]; then
            echo "DIR  $p  mode=$mode owner=$owner  [EXPECT 700]"
            fail=1
        else
            echo "DIR  $p  mode=$mode owner=$owner  OK"
        fi
        # Recurse one level
        for child in "$p"/* "$p"/.[!.]*; do
            [ -e "$child" ] || [ -L "$child" ] || continue
            check "$child"
        done
    else
        if [ "$mode" != "600" ] && [ "$mode" != "400" ]; then
            echo "FILE $p  mode=$mode owner=$owner  [EXPECT 600 or 400]"
            fail=1
        else
            echo "FILE $p  mode=$mode owner=$owner  OK"
        fi
    fi
}

for arg in "$@"; do
    check "$arg"
done

exit $fail
