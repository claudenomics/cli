# Releasing

The CLI ships to npm as `@claudenomics/cli`. Binary name stays `claudenomics`.

## One-time setup

1. **Create the npm org** `claudenomics` at https://www.npmjs.com/org/create (free tier, public packages only).
2. **Enable 2FA** on your npm account (Account Settings → Two-Factor Auth → "Authorization and publishing").
3. **Create an automation token**:
   Access Tokens → Generate → Granular →
   - Packages: read + write on `@claudenomics/*`
   - Organizations: read + write on `claudenomics`
   - Expiration: 1 year
4. Add the token as a repo secret named `NPM_TOKEN`
   (Settings → Secrets and variables → Actions → New repository secret).

## First publish (manual, from your laptop)

First publish has to happen locally so you own the package name before CI touches it.

```sh
npm login                          # once, uses 2FA
npm run build
cd app
npm publish                        # uses publishConfig: access=public, provenance=true
```

Verify: `npm view @claudenomics/cli`.

## Subsequent releases (CI)

```sh
npm version patch -w @claudenomics/cli   # or minor / major
git push --follow-tags
```

The `publish-cli` workflow fires on `v*` tags, runs typecheck + tests + build,
checks the tag matches the package version, then publishes with `--provenance`.

## Rolling back

npm forbids republishing a deleted version. If a release is broken:

1. `npm deprecate @claudenomics/cli@<bad-version> "see <good-version>"`
2. Bump and publish a fix.
3. `npm unpublish` only works within 72 hours and only if no dependents exist — avoid unless truly needed.
