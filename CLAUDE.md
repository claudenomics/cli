# claudenomics-cli

Transparent wrapper around `claude` and `codex` that proxies their API
traffic through a local HTTP server to count tokens. Open source. The
long-term goal is on-chain attested token receipts (Reclaim zkTLS →
Solana) — the current milestone is the transparent proxy + counting.

## Layout

npm workspaces monorepo, TypeScript project references, ESM, Node 20+.

```
app/                       claudenomics-cli (the bin, not a library)
packages/
├── logger/                @claudenomics/logger   chalk, scoped
├── proxy/                 @claudenomics/proxy    undici forwarder
└── usage/                 @claudenomics/usage    per-vendor extractors
```

Dependency graph is strictly one-way:

- `logger` ← `proxy` ← `app`
- `usage` ← `app`

`proxy` is vendor-agnostic — it knows nothing about LLMs. `usage` has
no side effects on import — the vendor registry lives in
`app/src/vendors.ts`, not in the package.

## Commands

- `npm run build` — `tsc -b` from root; builds in dependency order
- `npm test` — aggregates vitest across workspaces that declare `test`
- `npm run typecheck` — `tsc -b --noEmit`
- `node app/dist/index.js claude [args...]` — run the CLI
- `--verbose` — proxy debug logging (`CLAUDENOMICS_LOG=debug`)

## Extending

- **New LLM vendor**: drop `packages/usage/src/<name>.ts` exporting a
  `VendorConfig` (`name`, `upstream`, `extractor`, `childEnv`). Register
  in `app/src/vendors.ts`. No other files change.
- **New CLI command**: append to `BUILTIN_COMMANDS` in
  `app/src/commands.ts`. For non-passthrough commands, add a new
  `Command` directly in `app/src/index.ts`.
- **New pipeline step** (attestor, ledger write, metrics): add a
  `ResponseHandler` to the `onResponse` array in `app/src/runner.ts`.
  Handlers run after the client has received the response; each runs
  in isolation (one failure doesn't halt the pipeline).

## Non-obvious

- `claude` still honors `ANTHROPIC_BASE_URL`, but modern `codex` no
  longer routes correctly through `OPENAI_BASE_URL`. Codex 0.121 uses
  the Responses API over a websocket transport by default, so the
  wrapper injects `-c model_providers.<id>.*` overrides to force an
  HTTP `responses` provider pointed at `${proxy}/v1`.
- For Anthropic, the base URL **must not** have a path suffix — the
  SDK calls `new URL('/v1/messages', base)`, which strips any subpath.
- For API-key users, `runner.ts` mirrors `ANTHROPIC_API_KEY` into
  `ANTHROPIC_AUTH_TOKEN` since Claude Code expects the latter when a
  base URL override is set.
- Response bodies are buffered in full before `onResponse` runs. This
  is intentional — LLM responses are bounded, and extractors need the
  whole body. Don't redesign around streaming without a concrete need.
- Token extractors read **documented** fields only. Anthropic:
  `usage.input_tokens` / `usage.output_tokens` on the message body,
  plus `message_start` and cumulative `message_delta` SSE events.
  OpenAI: Chat Completions (`prompt_tokens` / `completion_tokens`,
  with `stream_options.include_usage=true` yielding a final
  `chat.completion.chunk` that carries usage) and the Responses API
  (`input_tokens` / `output_tokens`, with the `response.completed` SSE
  event carrying `response.usage`). No tree walking, no `[DONE]`
  special case — non-JSON SSE lines fall through `tryParse` silently.
- Workspace sibling deps pin to `"*"` so version bumps don't cascade.
  Don't re-pin them to concrete versions.

## Roadmap

- **M1 ✅** transparent wrapper + token counting
- **M2** Privy auth + Solana embedded wallet — small backend holds the
  Privy app secret; CLI delegates signing; `claudenomics auth login`
  links the CLI to the same wallet shown on the web app
- **M3** Reclaim zkTLS attestation — new `@claudenomics/attestor`
  package exposing `createAttestor(): ResponseHandler` that slots into
  the proxy pipeline. Proxy and usage stay untouched.
- **M4** Solana program verifying Reclaim Groth16 proofs + per-wallet
  on-chain token counters

The architecture was designed around the M3 pipeline shape. When
adding attestation, resist the urge to reshape `proxy` or `usage` —
everything needed is already plumbed through `ProxiedResponse`
(request bytes, response bytes, headers, status, url).
