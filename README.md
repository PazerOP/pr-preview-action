# Deploy PR Preview

Deploy previews of pull requests via GitHub Actions. This repo ships **two
interchangeable reusable workflows** — pick the one that matches where you host
previews:

| Workflow | Deploys to | Preview URL |
| --- | --- | --- |
| [`preview.yml`](.github/workflows/preview.yml) | [buildhost](https://github.com/wow-look-at-my/buildhost) static sites | `https://sites.[domain]/[project]/branch/pr-[number]/` |
| [`pr-preview-action-ghp.yml`](.github/workflows/pr-preview-action-ghp.yml) | [GitHub Pages](https://pages.github.com/) | `https://[owner].github.io/[repo]/pr-preview/pr-[number]/` |

Both leave a sticky comment on the PR with the preview link and update it as new
commits land.

> **Note:** This is a fork of [rossjrw/pr-preview-action](https://github.com/rossjrw/pr-preview-action). The GitHub Pages flavour replaces the original "Deploy from a branch" code path with artifact-based deployment via `actions/upload-pages-artifact` + `actions/deploy-pages`.

---

# buildhost previews (`preview.yml`)

Deploys each PR to its own buildhost site branch (`pr-<number>`) by reusing
buildhost's own [`buildhost-publish-site`](https://github.com/wow-look-at-my/buildhost/tree/master/.github/actions/buildhost-publish-site)
action. Authenticates with a GitHub Actions OIDC token (no static secret) — the
buildhost project is auto-provisioned from the repository on first publish.

## Usage

```yaml
# .github/workflows/preview.yml
name: Deploy PR previews

on:
    pull_request:
        types: [opened, reopened, synchronize]

permissions:
    contents: read
    actions: read # only needed when deploying from artifact-name
    pull-requests: write
    id-token: write

jobs:
    deploy-preview:
        uses: PazerOP/pr-preview-action/.github/workflows/preview.yml@v1
        with:
            source-dir: ./build/
            buildhost-server: https://pazer.build
        secrets: inherit
```

If your site needs a build step, build it in a separate job and pass the
artifact name instead of `source-dir`:

```yaml
    build:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v6
            - run: npm install && npm run build
            - uses: actions/upload-artifact@v4
              with:
                  name: build
                  path: ./build/

    deploy-preview:
        needs: build
        uses: PazerOP/pr-preview-action/.github/workflows/preview.yml@v1
        with:
            artifact-name: build
        secrets: inherit
```

Deploying from `artifact-name` requires the caller to grant `actions: read`
(see the permissions block above): the workflow downloads the named artifact
through the Actions REST API, which needs that scope.

## Inputs

| Input | Description |
| --- | --- |
| `source-dir` | Directory to deploy. Required when `artifact-name` is not set. <br> Default: `"."` |
| `artifact-name` | Name of a previously-uploaded artifact to deploy instead of `source-dir`. |
| `buildhost-server` | Base URL of the buildhost server. <br> Default: `https://pazer.build` |
| `project` | buildhost project name. <br> Default: the repository name. |
| `pr-number` | PR number for the preview branch (`pr-<number>`). <br> Default: from event context. |
| `comment` | Whether to leave a sticky comment with the preview URL. <br> Default: `true` |
| `public` | Serve the preview publicly even when the source repo is private (the preview URL works without a token). Opt-in. <br> Default: `false` |

## Outputs

| Output | Description |
| --- | --- |
| `preview-url` | URL of the deployed preview (from `buildhost-publish-site`). |

## How it works

1. Checks out `source-dir` (or takes the named artifact).
2. Runs `buildhost-publish-site`, which `tar.gz`s the directory and `PUT`s it to `https://sites.{domain}/{project}/branch/pr-{number}` using an OIDC token.
3. Posts/updates a sticky PR comment with the preview URL.

Because each PR writes only to its own `pr-<number>` site branch, there is no
shared mutable target — buildhost replaces a branch's site atomically on every
push.

---

# GitHub Pages previews (`pr-preview-action-ghp.yml`)

Deploys previews to GitHub Pages. Works when GitHub Pages is configured with the
source set to **GitHub Actions** (repository **Settings** > **Pages**).

## Usage

```yaml
# .github/workflows/preview.yml
name: Deploy PR previews

on:
    pull_request:
        types: [opened, reopened, synchronize]

jobs:
    deploy-preview:
        uses: PazerOP/pr-preview-action/.github/workflows/pr-preview-action-ghp.yml@v1
        with:
            source-dir: ./build/
        secrets: inherit
```

Permissions, concurrency, fork safety, and the GitHub Pages environment are all
handled internally by the reusable workflow. Cleanup of closed PR previews
happens automatically during every deploy. With a build step, pass
`artifact-name` instead of `source-dir` (same pattern as above).

## Inputs

All parameters are optional. Either `source-dir` or `artifact-name` must be provided.

| Input&nbsp;parameter | Description |
| --- | --- |
| `source-dir` | Directory containing files to deploy. E.g. `./dist/` or `./build/`. Required when `artifact-name` is not set. <br> Default: `"."` |
| `artifact-name` | Name of a previously-uploaded artifact to use as the deploy source. When set, the sparse checkout of `source-dir` is skipped and the artifact is downloaded instead. |
| `preview-branch` | Branch to save previews to. <br> Default: `gh-pages` |
| `umbrella-dir` | Path to the directory containing all previews. <br> Default: `pr-preview` |
| `action` | `deploy` or `auto`. `auto` deploys on `opened`/`reopened`/`synchronize`. Cleanup of closed PR previews happens automatically during every deploy. <br> Default: `auto` |
| `comment` | Whether to leave a sticky comment on the PR. <br> Default: `"true"` |
| `commit-status-context` | The context string for commit statuses. <br> Default: `"Preview"` |
| `pr-number` | The PR number to use for the preview path. <br> Default: from event context |
| `pages-base-url` | Base URL of the GitHub Pages site. <br> Default: auto-detected |
| `pages-base-path` | Path that GitHub Pages is served from. <br> Default: `""` |
| `shared-dirs` | Comma-separated list of directories that should be shared at the root level instead of duplicated into each PR preview subdirectory. During deploy these directories are merged additively into the gh-pages root. Unreferenced files in shared dirs are garbage-collected when closed PR previews are cleaned up. <br> Default: `""` |
| `deploy-commit-message` | Commit message when adding/updating a preview. <br> Default: `Deploy preview for PR {number}` |

## Outputs

| Output | Description |
| --- | --- |
| `deployment-action` | Resolved value of the `action` input (deploy, none). |
| `preview-url` | Full URL to the preview (includes `?v={short_sha}` cache-busting param). |

## How it works

1. **Push to branch**: Force-pushes the resolved tree (existing branch contents + the per-PR deploy + cleanup of closed PR previews) as a single-commit orphan to the `gh-pages` branch
2. **Upload artifact**: Checks out the full `gh-pages` branch and uploads it as a Pages artifact
3. **Deploy**: Deploys the artifact to GitHub Pages via `actions/deploy-pages`
4. **Comment**: Posts/updates a sticky PR comment with the preview URL
5. **Status**: Sets commit statuses (pending → success/failure) on the PR head SHA

The `gh-pages` branch serves as the source of truth for all content (production + all PR previews). Each deployment uploads the **entire** branch as a single artifact, since `actions/deploy-pages` replaces the whole site.

### Single-commit branch

Each run replaces `gh-pages` with **one orphan commit** containing the post-update tree. The previous history is discarded. This stops the branch from accumulating preview artifacts (which can be large and per-build unique, e.g. cross-compiled binaries) that are unreachable after the next push but otherwise stay in history forever. To make this safe, the workflow serializes all writes globally per repository via a `pr-preview-action-<repo>` concurrency group with `cancel-in-progress: false`. If you have tooling that depends on `gh-pages` history, expect each run to look like a fresh root commit.

### Ensure your main deployment is compatible

If you use GitHub Actions to deploy your main site (e.g. on push to main), configure it to not delete the preview umbrella directory when pushing to `gh-pages`.

---

# Acknowledgements

-   [rossjrw/pr-preview-action](https://github.com/rossjrw/pr-preview-action) (MIT), the original action this is forked from
