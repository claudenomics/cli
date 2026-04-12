#!/usr/bin/env bash
# Scan a directory and (optionally) a packed npm tarball for secret patterns.
# Usage: scan_secrets.sh <path> [<tarball>]
set -euo pipefail

PATH_TO_SCAN="${1:-.}"
TARBALL="${2:-}"

if ! command -v rg >/dev/null 2>&1; then
    echo "ripgrep (rg) required" >&2
    exit 2
fi

PATTERNS=(
    # Cloud / API
    'AKIA[0-9A-Z]{16}'                       # AWS access key
    'AIza[0-9A-Za-z_-]{35}'                  # Google API
    'sk-[A-Za-z0-9]{32,}'                    # OpenAI-style
    'sk-ant-[A-Za-z0-9_-]{20,}'              # Anthropic
    'ghp_[A-Za-z0-9]{36}'                    # GitHub PAT
    'ghs_[A-Za-z0-9]{36}'                    # GitHub server
    'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' # JWT
    'xox[baprs]-[A-Za-z0-9-]{10,}'           # Slack
    '-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----'
    # Privy / wallet
    'privy_[a-z]+_[A-Za-z0-9]{20,}'
    '0x[a-fA-F0-9]{64}'                      # 32-byte hex (private key shape)
    # Generic credentials assignment
    '(?i)(api[_-]?key|secret|token|passwd|password|auth)\s*[:=]\s*["'"'"']?[A-Za-z0-9+/=_-]{16,}'
)

scan() {
    local target="$1"
    echo "=== Scanning: $target ==="
    for p in "${PATTERNS[@]}"; do
        rg --no-messages -nH --hidden \
            -g '!.git' -g '!node_modules' -g '!target' -g '!dist' -g '!build' -g '!.next' \
            -e "$p" "$target" || true
    done

    echo "=== .env-style files in tree ==="
    rg --files --hidden \
        -g '!.git' -g '!node_modules' \
        "$target" 2>/dev/null \
        | rg -n '(^|/)\.env(\..*)?$' || true

    echo "=== suspicious filenames ==="
    rg --files --hidden \
        -g '!.git' -g '!node_modules' \
        "$target" 2>/dev/null \
        | rg -n '(\.pem$|\.key$|\.p12$|\.pfx$|id_rsa|id_ed25519|credentials\.json|service-account\.json|secrets\.ya?ml)' || true
}

scan "$PATH_TO_SCAN"

if [ -n "$TARBALL" ]; then
    if [ ! -f "$TARBALL" ]; then
        echo "Tarball not found: $TARBALL" >&2
        exit 2
    fi
    TMP=$(mktemp -d)
    trap 'rm -rf "$TMP"' EXIT
    tar -xf "$TARBALL" -C "$TMP"
    scan "$TMP"
fi
