# Threat model — STRIDE per component

Pre-filled for the stack: Privy loopback auth + persistent on-disk session + ZK proof + LLM agent with tools.

**Instructions**: For each row, either delete it (does not apply to this codebase, with one-sentence why) or annotate it with file:line where the threat surfaces. Generic rows that survive triage are a process violation.

| # | Component | Threat (STRIDE) | Concrete attack | Default mitigation expected |
|---|-----------|-----------------|-----------------|-----------------------------|
| 1 | Loopback listener | Spoofing | Other local process binds same port, receives `code` | Random port + EADDRINUSE abort; bind 127.0.0.1 |
| 2 | Loopback listener | Tampering | Listener accepts callback without `state` check | Reject any callback whose `state` ≠ generated value |
| 3 | Loopback listener | Information disclosure | HTML response echoes `code` to browser history | Response page contains no auth params |
| 4 | Browser → CLI | Tampering | Open-redirect at Privy returns to attacker URL | Exact-match `redirect_uri` registration |
| 5 | Token exchange | Spoofing | DNS / proxy MITM redirects token exchange | TLS validation; ignore `HTTP_PROXY` for token endpoint |
| 6 | Session file | Information disclosure | Other-user reads `~/.app/session.json` (mode 0644) | OS keychain, or 0600 file in 0700 dir |
| 7 | Session file | Tampering | Same-uid attacker swaps tokens with their own | Keychain ACL, or AEAD with key in keychain |
| 8 | Session file | Repudiation | No record of refresh-token use | Server-side rotation logs (out of CLI scope) |
| 9 | Refresh flow | Elevation of privilege | Old refresh token reused after rotation | Server-side rotation enforcement; client deletes old token before write |
| 10 | Wallet key (if user-custodial) | Information disclosure | Plaintext key on disk | Keychain only; never plaintext |
| 11 | Wallet key | Tampering | Malware swaps key; user signs attacker tx | Keychain ACL + signature confirmation prompt |
| 12 | ZK prover | Information disclosure | Witness leaks via debug log | No witness in logs; redact |
| 13 | ZK prover | Tampering | Weak RNG → witness recovery | OsRng / crypto.randomBytes only |
| 14 | ZK verifier | Spoofing | Client-only verification; server trusts boolean | Server independently verifies proof bytes |
| 15 | ZK proof | Replay | Same nullifier accepted twice | Nullifier set with global uniqueness check |
| 16 | ZK proof | Replay | Proof re-randomized and resubmitted | Replay key on statement, not proof bytes |
| 17 | ZK trusted setup | Tampering | Swapped ptau file → broken soundness | Hash-pinned, ceremony provenance documented |
| 18 | Agent loop | Elevation of privilege | Prompt injection in tool output → shell exec | Argv-only spawn + allowlist + per-call confirm |
| 19 | Agent loop | Information disclosure | Prompt injection → `read_file ~/.ssh/id_rsa` → `http_fetch` exfil | Read allowlist; no read+egress fan-out |
| 20 | Agent loop | Denial of service | Injection induces infinite tool loop / cost burn | Token budget, call-count cap, wall-clock timeout |
| 21 | Agent loop | Spoofing | Injected MCP-server URL trusted as configured | MCP servers pinned; no runtime registration |
| 22 | System prompt | Information disclosure | User asks model to repeat system prompt | System prompt contains no secrets |
| 23 | Context window | Information disclosure | Tokens included in prompt → coerced emission | Tokens never in prompt; only in tool-handler scope |
| 24 | CLI argv | Information disclosure | Secret in `--token=...` visible via `ps` | Secrets via env/stdin/file only |
| 25 | Subprocess env | Information disclosure | Inherited env leaks unrelated secrets to child | Explicit `env: {...}` on spawn |
| 26 | Update channel | Tampering | Self-update fetches code without signature | Signed releases; verify before exec |
| 27 | npm postinstall | Elevation of privilege | Installer runs network fetch → exec | No postinstall, or audited script only |
| 28 | Dependency | Tampering | Typosquat / dep-confusion of internal package | Scoped names; lockfile hashes; `npm ci` |
| 29 | Telemetry | Information disclosure | User prompts shipped to vendor | Opt-in only; PII redaction |
| 30 | Logs | Information disclosure | Refresh token logged at debug | Log scrubber + debug off in release |
| 31 | TLS | Spoofing | `rejectUnauthorized:false` left in code | Cert validation enforced; CI grep gate |
| 32 | Crypto | Tampering | Constant salt → cross-user same key | Per-install random salt stored alongside ciphertext |
| 33 | Crypto | Information disclosure | GCM nonce reuse → key recovery | Counter or random 96-bit per key with bound |
| 34 | JWT verification | Elevation of privilege | `alg=none` accepted | Allowlist algs; reject `none` / `HS*` confusion |
