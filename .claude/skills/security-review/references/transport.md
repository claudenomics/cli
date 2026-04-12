# Transport

## TLS validation

- All HTTPS clients must validate certs. Grep:
  - Node: `rejectUnauthorized:\s*false`, `NODE_TLS_REJECT_UNAUTHORIZED`, `tls.connect.*rejectUnauthorized`.
  - Python: `verify=False`, `ssl._create_unverified_context`.
  - Rust: `danger_accept_invalid_certs`, `accept_invalid_hostnames`.
  - Go: `InsecureSkipVerify: true`.
- Any hit: **Critical** (MITM trivial). Even behind an `if dev` flag, if the flag can be set in a release build, **High**.
- Custom CA bundles loaded from a path the user controls without warning: **Medium** (legitimate corporate use case, but document).

## Cert pinning

- Optional. Not pinning is acceptable for a CLI hitting Privy + a major LLM API; pinning increases robustness against CA compromise but breaks on legitimate cert rotation. If pinning is implemented:
  - Pins must be SPKI-hash-pinned, not full-cert-pinned. Full-cert pin: **Medium** (breaks on rotation).
  - Pin update mechanism must itself be authenticated. Update via plaintext fetch: **High**.
  - Backup pins required. Single pin: **Medium**.

## Loopback HTTP for callback

Plaintext HTTP on `127.0.0.1` is acceptable for the Privy callback **only when**:
1. Listener bound to `127.0.0.1` exclusively (see `references/auth-privy.md`).
2. The callback contains an authorization code, not an access token (the code is single-use and bound to the PKCE verifier the CLI holds).
3. State is verified.
4. The HTML response page does not echo `code` or `state` (browser history leak).

If any of these is missing, plaintext loopback becomes the attack surface. File the finding under the relevant condition.

## Proxy environment hijack

- `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` are honored by most HTTP clients. An attacker who can set env (e.g. via a sourced rc file they wrote, a postinstall script, a CI config) can MITM all requests via their proxy.
- Mitigation: for *security-sensitive* requests (token exchange, refresh, ZK verification submission), bypass proxy env or warn loudly when one is set. Silent honor of `HTTP_PROXY` for the token endpoint: **Medium**.

## DNS

- Use system resolver. Custom DoH/DoT to a hardcoded resolver requires the resolver itself be authenticated. Hardcoded DoH endpoint over HTTPS with cert validation: acceptable; over plaintext: **High**.
- DNS rebinding: see `references/llm-agent.md` network egress checks.

## HTTP methods + caching

- Token exchange uses POST. Tokens never in URL query. Tokens never in `GET` requests. Token in URL: **High** (access logs, browser history, `Referer` leakage).
- `Authorization: Bearer` header for API calls. Server-side `Cache-Control: no-store` is out of scope but flag if the CLI re-sends a cached response.

## Outbound host allowlist

- Build the list with `scripts/list_network_egress.py`. The list should be small: Privy auth, Privy API, the LLM API(s), possibly an attestor / chain RPC. Anything else needs justification.
- Hardcoded allowlist in source vs. config-driven: source is preferred (signed in the binary). Config-driven without signing: **Medium** if it can be widened by a malicious env or config file.
