# ZK integration

The skill reviews **integration**, not soundness. For soundness, emit CRYPTO-ESCALATE.

## Locate

Grep: `groth16`, `plonk`, `halo2`, `circom`, `snarkjs`, `risc0`, `sp1`, `noir`, `gnark`, `arkworks`, `bellman`, `ezkl`, `verify`, `prove`, `nullifier`, `witness`, `proving_key`, `verifying_key`, `srs`, `ptau`, `setup`, `reclaim`.

Identify and record:
- Which scheme.
- Which library and **version** (pin in lockfile).
- Where the proof is generated (client? server? attestor?).
- Where the proof is verified (client? server? on-chain?).
- What public inputs the proof binds.
- Where nullifiers come from.

## Checks

### Verification location
- Client-only verification while a server trusts a boolean from the client: **Critical** (escalation trigger #2 if it controls release of value, plus the attacker just claims `verified=true`). The server must independently verify the proof bytes.
- Verification on a Solana program / EVM contract: confirm the contract address is hardcoded or signed by the project, not derived from runtime CLI config (substitution attack: **High**).
- Verification result is consumed where? If it gates a state transition, the consumer must see the verified flag plus the bound public inputs, not just a yes/no.

### Trusted setup provenance
- Groth16 / KZG: SRS / ptau file source. Must come from a public ceremony with multiple participants, hash-pinned in the repo. If the project ran its own ceremony of size 1 (or appears to have), the proof system is broken — **Critical** + CRYPTO-ESCALATE.
- File integrity: SHA-256 (or stronger) checked at load time against a constant in source. Missing check: **High**.
- Version of the ceremony parameters matches the circuit's required power-of-tau. Mismatch: **Critical** (proofs may verify incorrectly or trivially).

### Circuit input validation
- Public inputs reaching the verifier must be range-checked **outside** the circuit too where the host language allows. Field elements > field modulus accepted by the verifier are usually rejected, but malformed inputs can crash it (DoS): **Low**.
- Private (witness) inputs: any user-provided witness component must be checked for the same constraints the circuit assumes (e.g. binary flags must be 0 or 1). The circuit's constraints are authoritative; if the integration assumes a constraint the circuit lacks, that's a soundness bug → CRYPTO-ESCALATE with the specific assumption.
- Public input encoding (endianness, packing): a mismatch between prover and verifier silently breaks soundness. Confirm both sides use identical encoding routines from the same library version.

### Nullifier construction
- Nullifier = `Hash(secret, context)` where `context` includes a domain separator unique to this use. Missing domain separator: **High** (replay across protocols).
- `context` must include the operation identifier (e.g. session id, request id, or epoch) sufficient that the same `secret` cannot produce the same nullifier in two distinct legitimate operations. If user-controllable inputs determine `context` without authentication: **High** (chosen-context replay, including malleable nullifier under prompt injection).
- Nullifier uniqueness enforced where? On-chain set, server DB, local file? Local file alone is **Critical** (attacker on second device replays).
- Hash function appropriate for the field: Poseidon / Pedersen for snark-friendly fields; Keccak / SHA-256 only when the circuit explicitly supports them. Mismatch: CRYPTO-ESCALATE.

### Proof malleability
- Groth16: a proof can be re-randomized (Bowe-Gabizon). If the verifier identity-checks proof bytes for replay, an attacker can submit a re-randomized variant that also verifies. Replay protection must be on a **statement-derived** value (nullifier, message hash), never the proof bytes themselves. Replay keyed on proof bytes: **High**.
- Other schemes (PLONK, STARK): consult library docs for known malleability properties.

### RNG for witness / blinding
- Must be CSPRNG. `Math.random`, `rand::thread_rng` without `OsRng` seeding for cryptographic use, `time(NULL)` seed: **Critical** (witness leak → secret recovery).
- If using a library that takes an `Rng` parameter, confirm the call site passes `OsRng` / `crypto.randomBytes`-backed source. Default `Default::default()` for `Rng` in some libraries is non-secure.

### Side channels & timing
- Verification on the server: timing leaks of public-input-dependent branches usually irrelevant for soundness, but flag if the proof-acceptance result is logged with timing — **Info**.
- Proof generation on the client: leaks witness via timing / power only matters for very high-value targets; flag as **Info** unless wallet keys are involved, then **Low** with a note.

### Library version + audit status
- The proving/verifying library must be a tagged release, not a git SHA from a fork. Forked dependency: **High** + escalation trigger #1 if the fork modifies circuits or proofs.
- Known vulnerabilities (check `RUSTSEC`, `npm audit`, GitHub advisories) for the pinned version: file at observed severity.

### Reclaim-specific (if used)
- Attestor URL is hardcoded or signed-config-pinned, not user-configurable at runtime: misconfigured → **Critical** (attacker stands up an attestor that signs anything).
- Attestor public key pinned in source / lockfile, not fetched at runtime over plaintext: **High** if fetched.
- Verification of attestor signature on the response is done before any business logic uses the response: **Critical** if not.

### "Don't roll your own" triggers
ZK-specific instances of escalation trigger #1 (general rule in `references/crypto-and-secrets.md`):
- Custom circuit not derived from a published, audited template.
- Custom hash for nullifiers (not Poseidon / Pedersen / Keccak as appropriate for the field).
- Manual field arithmetic in the host language for security-relevant values.
- Modified verifier code.
- Any "we made it more efficient by skipping X" comment near crypto code.
