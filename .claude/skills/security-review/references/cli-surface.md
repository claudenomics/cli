# CLI surface

## Argv visibility

- On Unix, `/proc/<pid>/cmdline` is world-readable on most distros, and `ps -ef` shows full argv to all users. Any secret in argv (`--token=`, `--api-key=`, an auth code mistakenly printed in URL form): **High**.
- Recommended: secrets via env, stdin, or file path (with file in `0600`).
- Grep usage code for `--password`, `--token`, `--key`, `--secret` flags. For each, file a finding unless the flag is documented as taking a *file path* not a value.

## Environment leakage

- Child processes inherit env. If the CLI spawns a subprocess (compiler, package manager, the wrapped `claude`/`codex` binary), it leaks every env var to the child including unrelated secrets. Mitigate by passing an explicit `env: {...}` to spawn, not inheriting. Grep `spawn`, `exec`, `Command::new` for missing explicit env: **Medium**.
- Logs that print `process.env` for debugging: **High**.
- Env containing tokens propagated into the LLM provider's request (some libs put env in user-agent or telemetry): **High**.

## Dotfile perms

- The CLI's config / state files: see `references/session-storage.md`.
- Shell rc modifications (`~/.bashrc`, `~/.zshrc`, `~/.profile`) by the installer: **High** unless the user explicitly opted in. Lines must be fenced with begin/end markers and removable by `uninstall`.

## Shell history

- If the CLI prompts the user to paste a token at a stdin prompt, that token may end up in shell history depending on how it was passed. Recommend `read -s` semantics (no echo, not in history). For args, recommend tooling that consumes from a pipe.
- Document `HISTIGNORE` advice as **Info**.

## Update channel

### Source
- `npm install -g`, `cargo install`, `brew`, signed binaries from GitHub releases — each has different trust properties.
- `curl ... | sh` install instruction in README: **High** (no integrity verification by default).
- Self-update that fetches and runs code at runtime without signature verification: **Critical** + escalation trigger #4.

### Signature
- Binaries: signed with `cosign`, `gpg`, or platform code-signing. Unsigned binaries shipped on a release page: **High**.
- npm: `npm` itself does not verify package signatures by default; consider `npm audit signatures` (≥ npm 9). Document if the package is published with provenance (`--provenance`).
- Verify the lockfile has integrity hashes (`package-lock.json` always does for npm ≥ 7; `Cargo.lock` always; `pyproject.toml` requires `pip --require-hashes` or `uv` lockfile).

### Update prompt UX
- Auto-update without consent: **Medium** (silent code change on user box).
- Update prompt that times out and updates by default: **Medium**.

## Postinstall scripts

- `package.json` `scripts.postinstall` / `preinstall` / `prepare`: any non-trivial script (not just `node-gyp rebuild` for a known native dep) is a finding. Network access in postinstall: **High**.
- Run `scripts/dep_audit.sh` and review the postinstall enumeration.
- Cargo `build.rs` files: enumerate; any that fetches code at build time is **High**.

## Dependency confusion / typosquatting

- Internal packages must be scoped (`@org/...`) and configured with a registry that rejects public-registry shadowing. Unscoped internal name: **High** (substitutable from public registry).
- New-in-this-version dependencies: list them. Each new dep is a trust expansion.
- Single-maintainer micropackages in the dep tree: **Info**, but flag if many (xz-utils-style supply-chain risk).

## Lockfile integrity

- `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` / `Cargo.lock` / `poetry.lock` / `uv.lock` present and committed: required.
- Missing lockfile in a published CLI: **High** (users get different deps than what was tested).
- `npm ci` / `cargo build --locked` / `pip install --require-hashes` used in CI: pass. Anything that resolves loosely: **Medium**.

## Binary provenance (SLSA)

- GitHub Actions with OIDC + provenance attestations (SLSA level 3): pass.
- No provenance and no reproducible build: **Medium** (cannot verify the published artifact came from the repo).

## Telemetry / PII

- Any outbound call not in the auth or LLM path. List them.
- Fields shipped: hostname (PII), full file paths (PII + workspace info), user prompts (PII + secret leak). Each shipped without explicit opt-in: **High**.
- Opt-out vs opt-in: opt-in is the bar. Opt-out: **Medium**.
- Crash reports including stack traces with paths and env: **Medium**.
