# Session storage

Persistent on-disk state across CLI invocations: access tokens, refresh tokens, possibly wallet material.

## Locate first

Grep for write sites:

- Node: `fs.writeFile`, `fs.writeFileSync`, `writeFile`, `keytar`
- Python: `open(.*['"]w`, `keyring.set_password`
- Rust: `std::fs::write`, `keyring::Entry`
- Go: `os.WriteFile`, `ioutil.WriteFile`, `keyring`

Build the list of files written. For each, confirm the checks below. Then run `scripts/check_file_perms.sh` against an actually-installed instance — code that *intends* to write 0600 may not, due to `umask` or wrapper functions.

## Checks

### At-rest encryption
- **Preferred**: OS keychain — macOS Keychain, Windows DPAPI / Credential Manager, Linux Secret Service / libsecret. Grep for `keytar`, `keyring`, `Security.framework`, `CryptProtectData`, `libsecret`, `gnome-keyring`.
- **Acceptable fallback**: file encrypted with a key derived from a per-user secret stored in the keychain. The file alone must not be decryptable.
- **Not acceptable**: plaintext JSON containing tokens. Plaintext refresh token or wallet key on disk: **Critical** if wallet, **High** if refresh token, **Medium** if short-lived access token only.
- "Encryption" by base64, XOR with constant, or rot13: **High** treated as plaintext.
- KDF, salt, AEAD choice: see `references/crypto-and-secrets.md`.

### File permissions (Unix)
- File mode: `0600` (owner read/write only). Anything broader: **High** (other users on host read tokens). Run `scripts/check_file_perms.sh`.
- Parent directory mode: `0700`. A `0755` parent allows enumeration of filenames and partial-path attacks: **Medium**.
- Files created with `O_NOFOLLOW` where available, or after `lstat` confirms target is not a symlink. Symlink-race-vulnerable creation: **Medium** (local attacker pre-creates a symlink to e.g. `/etc/passwd`; write usually fails, but the bug is real for any sensitive path the attacker can pre-stage).
- `umask` reliance is not enough. Code must `chmod` explicitly after `open` or use `O_CREAT|O_EXCL` with an explicit mode.

### File permissions (Windows)
- ACL must restrict to the current user SID. Default user-profile ACL is acceptable for `%LOCALAPPDATA%\<app>\` but explicit DACL is preferred for the secrets file. Verify with code, not assumption.

### Path selection
- Honor `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME` on Linux (state, not config, for tokens). Hardcoded `~/.<app>/` ignoring XDG: **Low** (portability, not security, but flag).
- macOS: `~/Library/Application Support/<app>/` for files; Keychain for secrets.
- Windows: `%APPDATA%\<app>\` for config, `%LOCALAPPDATA%\<app>\` for state, DPAPI/Credential Manager for secrets.
- Tokens placed in a path synced to cloud (iCloud, OneDrive, Dropbox) by default: **Medium** (silent exfil to user's cloud provider; outside CLI's threat boundary but worth flagging).

### Refresh token rotation
- Each refresh exchange invalidates the old refresh token (rotation). Confirm by reading the refresh code path; if the same refresh token is reused indefinitely: **Medium** (longer attacker window after theft).
- Rotated tokens must be persisted atomically: write-temp + `rename(2)`, not in-place truncate. In-place truncation interrupted yields a corrupted store and may leave the old token recoverable: **Low**.

### Revocation
- `logout` command must:
  - Call Privy revocation endpoint for refresh + access tokens.
  - Delete the on-disk store and keychain entry.
  - Best-effort zero in-memory copies (see `references/crypto-and-secrets.md`).
- Missing revocation network call: **Medium**. Missing on-disk delete: **High** (logout doesn't actually log out).

### Multi-process locking
- If two CLI invocations run concurrently and both refresh, the loser writes a stale token. Use file lock (`proper-lockfile`, `flock(2)`, `fcntl`).
- No locking + frequent concurrent invocations: **Medium** (auth loop / token corruption).

### Process memory
- Tokens read into memory should be cleared when no longer needed. JS/Go/Python cannot reliably zeroize, but a `Buffer.fill(0)` / `bytearray.fill(0)` after use is best-effort. Holding tokens in long-lived module-scope variables across the whole process lifetime: **Low** (only matters with core dump or debugger access).

### Backup / sync exclusion
- Recommend opt-out via `.nobackup` xattr (macOS) or per-OS equivalent for the directory. Missing: **Info** unless wallet material is involved, then **Low**.

### Wallet key custody (if user-custodial)
- See `references/crypto-and-secrets.md`. The bar is higher: keychain-only, never plaintext file even with restrictive perms.
- Export/backup commands must require interactive confirmation and emit to stdout, not a file. Writing the seed phrase to a file by default: **High**.
- Any code path that uploads, syncs, or transmits the key for any reason other than a documented attestation/refresh: escalation trigger #2.
