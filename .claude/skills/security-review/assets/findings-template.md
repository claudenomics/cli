# Security review report — <project> @ <git-sha>

**Reviewer**: Claude (security-review skill v1)
**Date**: <YYYY-MM-DD>
**Scope**: <paths included; paths explicitly excluded>
**Method**: security-review skill, all phases completed in order.

## Summary

| Severity | Count |
|----------|-------|
| Critical | N |
| High     | N |
| Medium   | N |
| Low      | N |
| Info     | N |

## Escalation triggers fired

(List by number from SKILL.md "Hard escalation triggers". Empty section if none. If non-empty, surface to human before they read further.)

- Trigger #N — <one-line> — see SR-<id>

## CRYPTO-ESCALATE referrals

(List items, each in the SKILL.md CRYPTO-ESCALATE format. Empty section if none.)

## Architecture map (Phase 1)

<one-page summary: languages, entry points, session paths, ZK sites, agent dispatch, outbound hosts. Every claim cited with file:line.>

## Threat model (Phase 2)

<the surviving rows of assets/threat-model.md, annotated with file:line>

## Findings

(One block per finding, ordered Critical → Info, then by ID. Schema is strict; deviations are rejected by the skill itself before emission.)

### [Critical] <Short title>
- **ID**: SR-<phase>-<nnn>
- **Location**: path/to/file.ts:L42–L58
- **CWE**: CWE-XXX (ASVS Vx.y.z if applicable)
- **Precondition**: <what the attacker needs — network position, local user, malicious npm dep, poisoned tool output, etc.>
- **Exploit sketch**:
  ```
  3–8 line concrete sketch. Names the primitive.
  If you cannot write one, downgrade severity.
  ```
- **Impact**: <session theft / wallet exfil / RCE / proof forgery / cost burn>
- **Fix**: <specific code or config change; not "sanitize">
- **Residual risk**: <what the fix does not cover>
- **Confidence**: high|medium|low — <why>

### [High] <Short title>
- **ID**: SR-<phase>-<nnn>
- ...

### [Medium] <Short title>
- **ID**: SR-<phase>-<nnn>
- ...

### [Low] <Short title>
- **ID**: SR-<phase>-<nnn>
- ...

### [Info] <Short title>
- **ID**: SR-<phase>-<nnn>
- ...

## Out of scope

<explicitly list things checked-but-passed only briefly, and things deferred>

## Reproduction commands

<every script invocation used, with output paths>
