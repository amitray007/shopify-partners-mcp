# Releasing

Releases go to npm as `shopify-partners-mcp`. CI cuts them; nobody publishes by hand after the first version.

## Each release

1. Merge pull requests to `main`. Each PR title must be a Conventional Commit (`feat: ...`, `fix: ...`, `chore: ...`). CI checks the title, and the squash merge uses it as the commit.
2. When the merge carries a `feat:` or `fix:` commit, the release workflow ships it with no manual step. release-please opens a release PR with the version bump and changelog, the workflow merges it at once, then tags `vX.Y.Z` and creates the GitHub release. `fix:` bumps the patch version; `feat:` bumps the minor version while the version is below 1.0. `chore:`, `ci:`, and `docs:` do not release.
3. The `npm` job in `.github/workflows/release.yml` checks out the tag, runs `pnpm check`, builds, packs, installs the tarball in a clean folder, smoke-tests it, and publishes it with provenance. npm trusted publishing authorizes the job, so no npm token is stored.

CI does not run on the release PR itself, because GitHub starts no workflows for pull requests opened with `GITHUB_TOKEN`. The `npm` job runs the full check on the tag before it publishes, so a failure there leaves a tag and GitHub release with no npm version. Fix the cause in a new `fix:` PR, which releases the next patch version.

The `npm` job runs only when the repository variable `NPM_PUBLISH` is `true`. If it fails, fix the cause and run the workflow by hand with the tag:

```sh
gh workflow run release.yml --repo amitray007/shopify-partners-mcp -f tag=v0.2.0
```

## First publish (done for 0.1.0)

0.1.0 was published by hand on 2026-11-20. The trusted publisher was added with `npm trust github shopify-partners-mcp --file release.yml --repo amitray007/shopify-partners-mcp --allow-publish --yes`, and `npm access set mfa=publish` now blocks publishing with a token. Trusted publishing still works.
