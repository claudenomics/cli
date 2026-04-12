# Auth (Privy browser-loopback flow)

Checklist for a CLI that opens a browser to Privy and receives the result on a local HTTP listener.

## Flow shape

Confirm by reading the code, not the docs:

1. CLI generates `state`, `code_verifier`, `nonce`. Where? With what RNG?
2. CLI starts a listener on `127.0.0.1:<port>`. Port chosen how?
3. CLI opens system browser with `redirect_uri=http://127.0.0.1:<port>/<path>` and the auth params.
4. User authenticates in the browser (Privy embedded wallet may also be created here).
5. Privy redirects browser to the loopback URL with `code` (and `state`).
6. CLI exchanges `code` + `code_verifier` for tokens.
7. CLI shuts down the listener.

Diagram this from the actual code, citing file:line for each step. A missing step IS a finding.

## Checks

### Listener bind address
- Must bind `127.0.0.1` (or `::1`), never `0.0.0.0` / `::` / a hostname. Anything else: **Critical** — any host on the network can intercept the code.
- Confirm with the literal string in `createServer`, `listen`, `bind`. Grep: `0\.0\.0\.0|listen\(\s*\d+\s*[,)]` (Node's `server.listen(port)` with no host arg listens on the unspecified IPv6 address — that is a finding too).
- `localhost` resolves via `/etc/hosts` and may not equal `127.0.0.1` on misconfigured boxes — prefer the literal IP.

### Port selection
- Ephemeral port (`listen(0)`) is preferred, provided Privy accepts dynamic ports as registered redirect URIs (often via per-port pre-registration).
- Fixed port: another local process can squat the port. Mitigation: detect EADDRINUSE and abort with explicit error. Falling through to "next port" silently is a finding (attacker-controlled port).
- If the port is registered with Privy as a literal, confirm the registered list does not include unused high-trust ports.

### `state` parameter
- Cryptographically random, ≥128 bits, generated with CSPRNG (`crypto.randomBytes`, `crypto.getRandomValues`, `secrets.token_urlsafe`, `rand::rngs::OsRng`).
- Verified on callback as **exact** equality. Missing verification, or `==` against a value that was never set: **High** at minimum, **Critical** if combined with a non-loopback bind.
- Stored only in memory of the CLI process for the duration of one auth attempt. Persisted state across invocations is a finding.

### PKCE
- `code_verifier`: 43–128 chars, CSPRNG.
- `code_challenge_method=S256`. `plain` is a finding.
- Verifier sent only on the token-exchange request, never logged.
- Implicit flow (`response_type=token`) detected anywhere: **Critical** + escalation trigger #5.
- PKCE absent entirely: **Critical** + escalation trigger #5.

### `nonce` (OIDC ID token)
- If an ID token is requested, `nonce` is generated CSPRNG, sent in the auth request, and **verified** in the returned ID token.
- Missing nonce verification while accepting an ID token: **High**.

### Redirect URI
- Exact-match registration with Privy (no wildcards, no path globs). Wildcard registration is escalation trigger #5.
- Path component must be specific (e.g. `/callback`), not `/`.
- The listener must reject any request whose path is not the expected callback path with 404. A catch-all handler that processes any path: finding (broadens attack surface, may be tricked into responding to arbitrary fetches from local browser tabs).

### Callback handling
- Listener accepts exactly one matching callback then shuts down. A loop that accepts multiple: finding (replay window).
- Timeout: listener self-closes after a bounded interval (e.g. 5 minutes). No timeout is a finding (resource exhaustion + extended attack window).
- The HTTP response page returned to the browser MUST NOT echo `code` or `state` — those land in browser history, screenshots, and screen-recorded videos. Echoing: **High**.
- The response should immediately tell the browser to close or navigate away from the loopback URL (so the URL leaves the address bar / history more gracefully).
- Origin / Referer: do not trust them. Browsers send them inconsistently to loopback. Authentication is via `state` + PKCE only.

### Token exchange
- Token endpoint URL is hardcoded or from a config that is itself authenticated; never derived from the callback parameters.
- Exchange uses HTTPS with cert validation enabled (see `references/transport.md`).
- Response parsed and validated: `token_type=Bearer`, expected `aud`, `iss`, `exp`. Any field missing in the parser is a finding.
- Token exchange request bypasses `HTTP_PROXY` env or warns when one is set (see `references/transport.md`).

### Embedded wallet creation
- If Privy creates an embedded wallet during this flow, identify the custody model:
  - **Privy-custodial (e.g. Shamir-shared)**: CLI never sees raw key. Confirm by grepping for `privateKey`, `secretKey`, `signingKey`, `seed`, `mnemonic` — none should be persisted by the CLI. Any persisted private key material is escalation trigger #2.
  - **User-custodial**: CLI receives the key. See `references/session-storage.md` for storage and `references/crypto-and-secrets.md` for handling.
- Wallet creation must require explicit user action in the browser; a silent "create wallet on first login" with no UX disclosure is a **Medium** unless documented.

### Browser opener
- Use a hardened opener (`open` package on npm, `xdg-open`, `start`, `rundll32 url.dll,FileProtocolHandler` on Windows). Never construct a shell command from any string the user or network controls. Grep `exec.*open|spawn.*xdg-open` for argv that includes attacker-influenced data — finding.

### Argv & env of the launched browser
- The loopback URL is passed as argv to the browser. Argv is visible to other local users via `ps`. The auth code itself is in the response from Privy → browser → loopback, not in the launched URL, so this is acceptable. Confirm no `client_secret` or pre-shared token is in the launched URL — finding if so.

### Token returned to CLI
- Refresh token: stored per `references/session-storage.md`.
- Access token transport rules (header-only, no URL query): see `references/transport.md` "HTTP methods".
- After exchange, `code` and `code_verifier` are zeroed/dropped — see `references/crypto-and-secrets.md`.
