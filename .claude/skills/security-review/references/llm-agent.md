# LLM agent loop

The CLI wraps Claude/Codex. Model output is parsed into tool calls; tool outputs feed back into the next model turn. Treat all model output as **untrusted attacker-controlled** for the purposes of taint analysis.

## Locate

- The dispatch function: where tool-call JSON from the model is matched to a handler.
- The full tool registry: every tool name, its handler, and what it can read, write, network, or execute.
- The context-construction function: what data is concatenated into prompts (file contents, web pages, prior tool outputs, env, secrets).

Cite file:line for each. The agent loop is the highest-blast-radius surface in this stack — incomplete enumeration is a process violation.

## Taint sources

Treat as tainted:
- Model assistant messages (including tool-call argument values).
- Tool outputs that originate from outside the trust boundary: file reads, HTTP fetches, shell stdout, MCP server responses.
- User-supplied prompts (lower priority, but still untrusted for *destructive* actions).

## Taint sinks (the dangerous endpoints)

For each sink, the agent must enforce explicit policy. Missing policy = finding.

### Shell execution
- Sinks: `child_process.exec`, `execSync`, `spawn` with `shell:true`, `subprocess.run(..., shell=True)`, backtick `` `...` ``, Rust `Command::new("sh")`, Go `exec.Command("sh", "-c", ...)`.
- Run `scripts/find_shell_construction.py`.
- Required: argv array (no shell), command on an allowlist OR per-call user confirmation. Best: both. Neither = **Critical** + escalation trigger #3.
- String concatenation of model output into command: **Critical** even with allowlist (allowlist bypass via clever args, semicolons inside a "single argument", flag injection like `--exec`).
- `set -e` / `pipefail` does not protect against this; this is about argument injection, not error handling.
- "Sandboxing" via `chroot`, `firejail`, or container claims must be verified — flag as Info if claimed but unverified.

### Filesystem write/delete/move
- Sinks: `fs.writeFile`, `fs.unlink`, `fs.rename`, `fs.rm`, `os.remove`, `shutil.rmtree`, `std::fs::remove_*`.
- Required: path canonicalized (`fs.realpath`) and verified to be inside an allowlisted root (e.g. cwd, project dir). Write to `..`-traversed path: **High**.
- Delete/move: per-call user confirmation OR dry-run mode by default. Silent `rm -rf` derived from model output: **Critical** + escalation trigger #3.
- TOCTOU: canonicalize and open by handle in the same step where possible; canonicalize-then-open allows an attacker to swap the path.

### Filesystem read
- Sinks: `fs.readFile`, `open`, `cat`-via-shell.
- Required: path allowlist OR explicit user grant for paths outside cwd. Reading `~/.ssh/id_rsa`, `~/.aws/credentials`, `.env`, `~/.<app>/session.json` (own session file!), `/etc/shadow`, or anything matching `scripts/scan_secrets.sh` patterns should be denied or require explicit consent.
- A `read_file` tool with no allowlist combined with a network-capable tool (`http_fetch`, `git push`, `curl` shell, anything that egresses): **Critical**. This is the canonical exfil pair under prompt injection.

### Network egress
- Sinks: `fetch`, `http.request`, `axios`, `requests`, `reqwest`, MCP servers that proxy.
- Required: host allowlist for autonomous calls. URL derived from model output without allowlist: **High** alone, **Critical** when paired with read tools (exfil pair).
- Block link-local (`169.254.0.0/16`, AWS/GCP IMDS), `127.0.0.0/8`, and RFC1918 by default unless explicitly enabled. SSRF to cloud metadata: **Critical**.
- DNS-rebinding-safe: resolve once, connect to the resolved IP, or refuse non-public IPs after resolution.

### Spawning child models / agents
- A tool that calls another LLM with model-supplied prompts compounds prompt injection. Required: the child invocation does not inherit shell/fs/network tools without re-confirming policy. Tool inheritance to subagents: **High**.

### MCP server registration
- MCP servers are trusted code loaded by the agent. Auto-installing or auto-trusting an MCP server from model output: **Critical**.
- Pinned MCP server list with hash verification: pass. Server URL configurable via env without signature: **High**.
- MCP server stdio bridges that exec arbitrary local binaries: enumerate them; treat each as an extension of the agent's privileges.

## Prompt injection defenses (qualitative)

These are mitigations, not solutions. None alone is sufficient. The skill records which are **present**, not which are "good enough":

- Tool-output wrapping: model-readable delimiters around tool output that are stripped from any further interpretation.
- System-prompt instruction telling the model to ignore instructions in tool output. Document presence; rate as **Info**, not a defense.
- Plan/execute split: a planning model produces a plan; a separate execution layer enforces policy. If present, document the policy file.
- Per-action confirmation for destructive verbs.
- Capability tokens / capability-restricted subagents.

## Information leakage

### Context-window secret leakage
- Does the prompt include the user's session token, wallet key, or any value from `references/session-storage.md`? Direct inclusion: **Critical** (the model can be coerced to emit it via tool output or response).
- Does it include `process.env` dumps, full file contents of `.env`, or `git config --list`? **High**.
- Does it include API keys for the LLM provider itself? Some libs accidentally include `Authorization` headers in error context — grep error-handling code for `headers`, `Authorization`. Finding if found.

### System prompt extractability
- A user (or an injecting third party) can ask the model to repeat the system prompt. If the system prompt contains secrets, they will be exfiltrated. This is **structural** — the system prompt must contain only non-secret instructions.

### Cost / rate abuse
- Prompt injection can cause the agent to loop, retry, or fan out into expensive tool calls. Required: per-session token budget, per-tool call-count cap, wall-clock timeout on the agent loop. Missing all three: **Medium** (financial DoS).

## Privilege boundaries

- Does a successful jailbreak (model following injected instructions) gain anything the user couldn't already do? If yes — e.g. the agent runs as a service account with broader perms than the invoking user, the agent has cached creds the user doesn't, or the agent can install background daemons — the gap is the finding's impact.
- For a CLI run by the user, the practical boundary is: the agent should not be able to do anything the user did not type as a prompt this session. Persistent state, scheduled tasks, or background daemons that the agent can install break this.
