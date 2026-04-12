# Crypto and secrets

## Algorithm choice

- Symmetric encryption: AES-256-GCM, ChaCha20-Poly1305. Anything else (AES-CBC, AES-CTR without MAC, raw stream cipher, RC4): **High** to **Critical** depending on use.
- Hash: SHA-256 / SHA-3 / BLAKE2/3. MD5 / SHA-1 for security purposes: **High**.
- Password / passphrase KDF: Argon2id (preferred), scrypt, PBKDF2-HMAC-SHA256 (≥ 600k iterations as of 2026 OWASP guidance). PBKDF2 with low iter or SHA-1: **High**. Single SHA-256 of a passphrase: **Critical**.
- Asymmetric: Ed25519 / X25519 for new code; ECDSA-P256 if interop required; RSA only with OAEP/PSS and ≥ 2048-bit. RSA-PKCS1v1.5 for encryption: **High**.

## AEAD usage

- Nonce/IV: 96-bit random for GCM is acceptable up to ~2^32 messages per key (birthday bound), but counter-based is safer for known-bounded use. **Nonce reuse with the same key: Critical** (catastrophic for GCM — full key recovery via the forbidden-attack).
- Verify `nonce + ciphertext + tag` are stored together and the tag is checked by the AEAD construction itself, not in user code (a "compare tag manually" path is a finding — likely non-constant-time).
- Associated data: bind ciphertext to context (e.g. file path, user id) to prevent ciphertext substitution.

## Key derivation

- Keys derived from low-entropy material (passphrase, PIN) MUST use a slow KDF (Argon2id). High-entropy material (random bytes from keychain) can use HKDF.
- Domain separation in HKDF `info` parameter — different uses of the same root key must use different `info`. Missing `info` or constant `info`: **Medium** (cross-purpose key reuse).
- Constant salt across installs (see `references/session-storage.md`): **High**.

## Secret lifetime in memory

- Realism: in JS/Python/Go, you cannot reliably zero memory due to GC and string immutability. Best-effort:
  - JS: use `Buffer` (mutable) over `string`, `buf.fill(0)` after use.
  - Python: use `bytearray`, overwrite; avoid `str` for secrets.
  - Rust: `zeroize` crate with `Zeroize`/`ZeroizeOnDrop` derives. Skipping `zeroize` for key material in Rust where the type ergonomics support it: **Low**.
- Never `console.log`, `print`, `dbg!`, `format!("{:?}", secret)` a secret. Implement `Debug` to elide. Auto-derived `Debug` on a struct with secret fields: **Medium**.

## Log scrubbing

- Define a set of regexes for known secret shapes (Privy access token prefix, refresh token prefix, JWT pattern `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`, hex32+, base58 wallet keys).
- Hook the logger to scrub matches. Missing scrubber: **Medium**.
- Test with `scripts/scan_secrets.sh` against a captured log file in addition to the repo.
- Verify default log level in any release config is **not** `debug`/`trace`. Debug-by-default in a path that ships: **High**.

## Signature verification

- Where the CLI verifies signatures (update binary, attestor response, Privy JWT):
  - JWT: verify `alg` against an allowlist (`RS256`, `ES256`, `EdDSA`); reject `none` and reject `HS*` if expecting RS/ES. `alg` confusion accepted: **Critical**.
  - JWKS: keys fetched once, cached, refreshed on `kid` miss. Refetching JWKS on every request: DoS amplifier; flag **Low**.
  - Verify `iss`, `aud`, `exp`, `nbf`, and `iat` skew. Missing any: **Medium**.

## Randomness

- All cryptographic randomness via OS CSPRNG (see `references/zk.md` RNG notes). Audit for `Math.random`, `rand()`, `random.random` in any path that produces a key, nonce, salt, state, OAuth `state`, PKCE verifier, or witness blinding: **Critical**.

## Time

- `expires_at` from server is UTC seconds. Client clock skew can cause premature or late expiry. Allow ±5 min skew on validation; refresh proactively before claimed expiry. Missing skew handling: **Low**.
- Comparisons of HMAC tags / signature bytes / nonce equality where the comparand is a secret must be constant-time (`crypto.timingSafeEqual`, `hmac.compare_digest`, `subtle::ConstantTimeEq`). Variable-time `==` on a secret: **Medium** (timing oracle).

## Don't roll your own

If the codebase implements any of the following from primitives, escalation trigger #1:
- A signature scheme.
- An authenticated encryption mode.
- A KDF.
- A protocol with multiple round-trips and shared secrets.
- A "lightweight" hash or stream cipher.

Default response: replace with a reviewed library. Document as CRYPTO-ESCALATE if removal is non-trivial.
