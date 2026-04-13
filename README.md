# claudenomics

Wrap `claude` and `codex` with attested, wallet-bound token metering.

## Install

```sh
npm install -g claudenomics
```

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

| variable | default |
| --- | --- |
| `CLAUDENOMICS_AUTH_URL` | — |
| `CLAUDENOMICS_JWKS_URL` | — |
| `CLAUDENOMICS_JWT_ISSUER` | — |
| `CLAUDENOMICS_ENCLAVE_URL` | — |
| `CLAUDENOMICS_API_URL` | `https://api.claudenomics.xyz` |
| `CLAUDENOMICS_LOG` | `info` |

## Links

[claudenomics.xyz](https://claudenomics.xyz) · [x.com/claudenomics](https://x.com/claudenomics)

## License

MIT
