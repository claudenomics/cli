---
name: security-review
description: Rigorous security audit of a CLI tool that uses Privy browser-loopback auth, persistent on-disk sessions, a zero-knowledge proof component, and wraps Claude/Codex as an agent that issues tool calls. Use when the user says "review my CLI for security", "audit this auth flow", "check session handling", "look for prompt injection in my agent", "security pass on the ZK integration", "audit Privy login", or "review the agent's tool calls". Not for generic webapp review, generic appsec, or non-CLI software.
---

# security-review

Audits a CLI with this exact stack:

1. **Auth**: Privy browser login via loopback redirect.
2. **Session**: tokens (and possibly wallet material) persisted on disk across invocations.
3. **ZK**: proof generation and/or verification in the request path.
4. **Agent**: wraps Claude/Codex; model output drives tool calls including shell/fs.

Generic appsec checklists are out of scope. Every finding must be tied to this stack.

## How to use this skill

Run the phases in order. Do not skip ahead. Each phase has a reference file with a checklist; load it when you reach the phase.

| Phase | Reference | Output |
|------:|-----------|--------|
| 0 | (none) | Confirm scope with user; locate repo root |
| 1 Recon | (inline below) | One-page architecture map |
| 2 Threat model | `assets/threat-model.md` | Filled table, only real threats |
| 3a Auth | `references/auth-privy.md` | Findings |
| 3b Session | `references/session-storage.md` | Findings |
| 3c ZK | `references/zk.md` | Findings + any CRYPTO-ESCALATE markers |
| 3d Agent | `references/llm-agent.md` | Findings |
| 3e CLI surface | `references/cli-surface.md` | Findings |
| 3f Transport | `references/transport.md` | Findings |
| 3g Crypto/secrets | `references/crypto-and-secrets.md` | Findings |
| 4 Cross-cutting | (inline below) | Findings |
| 5 Triage & report | `assets/findings-template.md` | Final report |

A finding produced before its phase is a process violation. Restart the phase.

## Phase 1 — Recon

Produce a one-page architecture map. Use the **Locate** section of each reference file for per-domain greps; do not duplicate them here. The map must include:

- Languages, runtimes, entry points (`bin`, `main`, shebangs).
- Session-write sites — see `references/session-storage.md`.
- Auth flow endpoints — see `references/auth-privy.md`.
- ZK invocation sites — see `references/zk.md`.
- Agent dispatch + full tool registry — see `references/llm-agent.md`.
- Outbound hosts — `scripts/list_network_egress.py`.

Cite file:line for every claim.

## Phase 2 — Threat model

Open `assets/threat-model.md`. For each row, **delete it** if the threat does not apply to this codebase (with a one-line why), or **annotate it** with the file:line where the threat surfaces. Generic rows that survive triage are a process violation.

## Phase 3 — Phase scans

Run each reference file's checklist in order. For every checklist item, either:

- **Pass** with the file:line that justifies it, or
- **Finding** in the strict schema (see `assets/findings-template.md`).

No "N/A" without a sentence saying *why* it doesn't apply here.

## Phase 4 — Cross-cutting

Supply chain, update channel, postinstall, telemetry, dependency confusion, lockfile integrity, SLSA — all in `references/cli-surface.md`. Run `scripts/dep_audit.sh` as part of that phase.

What is NOT in any per-domain reference and must be swept here:

- **Error messages**: grep `console.error`, `eprintln`, `log.error` — any path printing tokens, paths under `$HOME`, or stack traces containing secrets.
- **Default log level**: grep `debug`, `trace`, `LOG_LEVEL`. Debug on by default in a release config: **High** (cross-references log scrubbing in `references/crypto-and-secrets.md`).
- **Dev artifacts shipped**: `.env*`, `*.pem`, `test/`, `fixtures/`, `.map`, TODOs with credentials. Run `scripts/scan_secrets.sh` against the **packed** artifact, not just the repo.

## Phase 5 — Triage & report

Dedupe (same root cause across files = one finding with multiple locations). Rank by severity. Emit the report using `assets/findings-template.md` verbatim.

## Severity ladder

Use these words. Do not invent new ones. Severity is **blast radius × precondition difficulty**, not a CVSS calculation.

- **Critical**: remote or local-unprivileged attacker gains code execution, wallet key, or session takeover with no user interaction beyond normal CLI use. Example: prompt-injection → arbitrary shell on user box.
- **High**: same impact but requires a realistic precondition (malicious dep already installed, user on shared host, attacker on same LAN for loopback race). Example: loopback callback bound to 0.0.0.0.
- **Medium**: impact is bounded (cost burn, session theft requiring local file read with prior foothold, info disclosure of paths/IDs). Example: refresh token logged at debug.
- **Low**: defense-in-depth gap with no current exploit path. Example: AEAD used correctly but key lifetime in memory is longer than necessary.
- **Info**: observation worth recording, no action required. Example: dependency uses old but unaffected version.

If you cannot write a 3–8 line exploit sketch (see schema), the finding is at most **Low**. If you can write one but need a precondition the threat model does not grant, drop one severity level.

## Adversarial assumptions (apply throughout)

- **The LLM is partially adversarial.** Tool outputs, fetched URLs, and file contents the agent reads may carry injected instructions. Any path from model output → shell, fs write, network, or another model call is a prompt-injection sink. Trace taint.
- **The user's machine is shared or compromisable.** Session files must survive a same-UID attacker (other process), or the docs must say they don't.
- **The Privy callback server is local attack surface.** Another process on the host can race for the port, hit the callback, or read argv.
- **Dependencies are hostile by default.** Postinstall scripts, new transitive deps, unpinned versions are findings until proven safe.
- **The reviewer (you) is the weakest link on ZK.** If you are not certain about soundness, emit **CRYPTO-ESCALATE** with the exact question for a human cryptographer. Do not bluff.

## CRYPTO-ESCALATE format

```
CRYPTO-ESCALATE: <one-line summary>
- Construction: <name circuit / scheme / library + version>
- File: path:line
- Question for human cryptographer: <specific, falsifiable question>
- What I checked: <integration-level checks completed>
- What I cannot verify: <soundness claim, parameter choice, etc.>
```

A CRYPTO-ESCALATE is not a finding; it is a referral. It appears in its own section of the final report, ahead of findings.

## Hard escalation triggers (stop and surface)

Stop the scan and surface to the human immediately when any of these are detected:

1. Custom cryptographic construction — inventing protocols, KDFs, signature schemes; modifying a circuit; rolling a "lightweight" hash for nullifiers.
2. Session material or wallet keys leave the device for any reason other than a documented auth refresh.
3. Agent loop executes shell with arguments derived from model output without (a) an allowlist *and* (b) a per-call user confirmation, or with only one of the two for destructive verbs.
4. Update mechanism ships unsigned binaries or fetches executable code at runtime.
5. Privy configuration uses implicit flow, wildcard `redirect_uri`, or missing PKCE.

For triggers 1–5, the report's first section is "Escalation triggers fired", before CRYPTO-ESCALATE and findings.

## What this skill does NOT do

- No "consider using X" findings. Every finding is actionable or it is deleted.
- No CVSS scoring. Use the qualitative ladder above.
- No copy-pasted OWASP Top 10. CWE references allowed; lectures are not.
- No style, perf, or non-security bugs. Out of scope.
- No claim that a ZK scheme "is secure". Only that the integration does or does not misuse it.
- No finding without a file:line or a named configuration key.
- No review of code paths the user has flagged as out-of-scope without re-confirming.

## Scripts (in `scripts/`)

- `scan_secrets.sh PATH [TARBALL]` — secret patterns in repo and packed artifact.
- `check_file_perms.sh PATH...` — runtime perms on session files (run on installed instance).
- `list_network_egress.py PATH` — every outbound URL/host literal in source.
- `dep_audit.sh [PATH]` — vuln audit + postinstall script enumeration.
- `find_shell_construction.py PATH` — locates exec/spawn/system/backtick sites; flags any whose argv reaches the agent loop.

Run scripts before drawing conclusions. Cite their output by file:line in findings.
