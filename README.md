# claudenomics

Wrap `claude` and `codex` with attested, wallet-bound token metering.

## Install

```sh
npm install -g @claudenomics/cli
```

<details>
<summary>Other package managers</summary>

```sh
pnpm add -g @claudenomics/cli
yarn global add @claudenomics/cli
bun install -g @claudenomics/cli
```
</details>

Requires Node 20+ and either `claude` or `codex` on `PATH`.

## Quick start

```sh
claudenomics login
claudenomics claude "fix the failing test"
claudenomics usage
```

## Commands

| | |
| --- | --- |
| `login` | Sign in with Privy. |
| `whoami` | Show signed-in identity. |
| `logout` | Clear the local session. |
| `usage` | Show your token totals. |
| `status` | Session, enclave, and API health. |
| `claude` `[args]` | Run `claude` through the wrapper. |
| `codex` `[args]` | Run `codex` through the wrapper. |

Arguments after `claude` / `codex` are passed through unchanged.

## Configuration

All URLs default to production. Override any of them to point at a local stack.

| variable | default |
| --- | --- |
| `CLAUDENOMICS_AUTH_URL` | `https://auth.claudenomics.xyz/cli-auth` |
| `CLAUDENOMICS_JWKS_URL` | `https://auth.claudenomics.xyz/.well-known/jwks.json` |
| `CLAUDENOMICS_JWT_ISSUER` | `https://auth.claudenomics.xyz` |
| `CLAUDENOMICS_ENCLAVE_URL` | Phala TDX enclave |
| `CLAUDENOMICS_API_URL` | `https://api.claudenomics.xyz` |
| `CLAUDENOMICS_LOG` | `info` |
| `CLAUDENOMICS_SKIP_UPDATE_CHECK` | `0` |

## Links

[claudenomics.xyz](https://claudenomics.xyz) · [x.com/claudenomics](https://x.com/claudenomics)

## License

MIT
