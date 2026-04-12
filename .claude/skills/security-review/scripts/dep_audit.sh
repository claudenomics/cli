#!/usr/bin/env bash
# Wrap dependency audit + enumerate package install/build scripts.
# Usage: dep_audit.sh [<path>]
set -uo pipefail

ROOT="${1:-.}"
cd "$ROOT"

section() { echo; echo "===== $1 ====="; }

# --- npm / yarn / pnpm ---
if [ -f package.json ]; then
    section "npm: install scripts in root package.json"
    node -e '
        const p = require("./package.json");
        const hooks = ["preinstall","install","postinstall","prepare",
                       "prepublish","prepublishOnly","preuninstall","uninstall","postuninstall"];
        const s = p.scripts || {};
        let any = false;
        for (const h of hooks) if (s[h]) { console.log(h + ": " + s[h]); any = true; }
        if (!any) console.log("(none)");
    ' 2>/dev/null || echo "(could not parse package.json)"

    section "npm: transitive packages with install scripts (lockfile scan)"
    if [ -f package-lock.json ]; then
        node -e '
            const lock = require("./package-lock.json");
            const pkgs = lock.packages || {};
            let any = false;
            for (const [name, meta] of Object.entries(pkgs)) {
                if (meta && meta.hasInstallScript) { console.log("hasInstallScript: " + name); any = true; }
            }
            if (!any) console.log("(none flagged in lockfile)");
        ' 2>/dev/null || echo "(lockfile parse failed)"
    else
        echo "(no package-lock.json)"
    fi

    section "npm audit"
    if command -v npm >/dev/null 2>&1; then
        if npm audit --omit=dev --json 2>/dev/null > /tmp/npm-audit.json; then
            node -e '
                try {
                    const a = require("/tmp/npm-audit.json");
                    const v = a.metadata && a.metadata.vulnerabilities;
                    if (v) console.log(JSON.stringify(v, null, 2));
                    else console.log("no vulnerabilities field");
                } catch(e) { console.log("audit unavailable: " + e.message); }
            '
        else
            echo "npm audit failed (offline or registry error)"
        fi
    else
        echo "npm not on PATH"
    fi

    section "npm audit signatures"
    if command -v npm >/dev/null 2>&1; then
        npm audit signatures 2>&1 | tail -n 30 || true
    fi

    section "lockfile presence (npm)"
    for f in package-lock.json yarn.lock pnpm-lock.yaml; do
        [ -f "$f" ] && echo "PRESENT $f" || echo "ABSENT  $f"
    done
fi

# --- Cargo ---
if [ -f Cargo.toml ]; then
    section "cargo: build.rs files (custom build scripts)"
    find . -name build.rs \
        -not -path '*/target/*' \
        -not -path '*/node_modules/*' 2>/dev/null || echo "(none)"

    section "cargo audit"
    if cargo audit --version >/dev/null 2>&1; then
        cargo audit 2>&1 | tail -n 50
    else
        echo "cargo-audit not installed (cargo install cargo-audit)"
    fi

    section "lockfile presence (cargo)"
    [ -f Cargo.lock ] && echo "PRESENT Cargo.lock" || echo "ABSENT  Cargo.lock"
fi

# --- Python ---
if [ -f pyproject.toml ] || [ -f requirements.txt ]; then
    section "pip-audit"
    if command -v pip-audit >/dev/null 2>&1; then
        pip-audit 2>&1 | tail -n 80
    else
        echo "pip-audit not installed (pip install pip-audit)"
    fi
    section "lockfile presence (python)"
    for f in poetry.lock uv.lock Pipfile.lock requirements.txt; do
        [ -f "$f" ] && echo "PRESENT $f" || echo "ABSENT  $f"
    done
fi

# --- Go ---
if [ -f go.mod ]; then
    section "govulncheck"
    if command -v govulncheck >/dev/null 2>&1; then
        govulncheck ./... 2>&1 | tail -n 80
    else
        echo "govulncheck not installed (go install golang.org/x/vuln/cmd/govulncheck@latest)"
    fi
fi

section "DONE"
