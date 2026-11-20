# Releasing

Releases go to npm as `shopify-partners-mcp`. CI cuts them; nobody publishes by hand after the first version.

## Each release

1. Merge pull requests to `main`. Each PR title must be a Conventional Commit (`feat: ...`, `fix: ...`, `chore: ...`). CI checks the title, and the squash merge uses it as the commit.
2. release-please keeps a release PR open with the next version and the changelog.
3. Merge the release PR. That merge is the approval. It tags `vX.Y.Z` and creates the GitHub release.
4. The `npm` job in `.github/workflows/release.yml` checks out the tag, runs `pnpm check`, builds, packs, installs the tarball in a clean folder, smoke-tests it, and publishes it with provenance. npm trusted publishing authorizes the job, so no npm token is stored.

The `npm` job runs only when the repository variable `NPM_PUBLISH` is `true`. If it fails, fix the cause and run the workflow by hand with the tag:

```sh
gh workflow run release.yml --repo amitray007/shopify-partners-mcp -f tag=v0.2.0
```

## First publish (one time)

npm trusted publishing works only for a package that already exists, so the first version goes up from a computer:

```sh
npm login                       # with two-factor authentication
pnpm install --frozen-lockfile
pnpm check && pnpm build && pnpm smoke
npm publish --access public
npm trust github shopify-partners-mcp --file release.yml --repo amitray007/shopify-partners-mcp --allow-publish --yes
npm access set mfa=publish shopify-partners-mcp
gh variable set NPM_PUBLISH --body true --repo amitray007/shopify-partners-mcp
```

After `npm access set mfa=publish`, tokens can no longer publish. Trusted publishing still works.
