# Deploy PR Preview

Deploy previews of pull requests to [GitHub Pages](https://pages.github.com/). Works when GitHub Pages is configured with source set to **GitHub Actions**.

Features:

-   Creates and deploys previews of pull requests to your GitHub Pages site
-   Leaves a comment on the pull request with a link to the preview so that you and your team can collaborate on new features faster
-   Updates the deployment and the comment whenever new commits are pushed to the pull request
-   Sets commit statuses on the PR head SHA to indicate deployment progress
-   Cache-busted preview URLs ensure you always see the latest content
-   Cleans up after itself &mdash; every deploy automatically removes preview directories for closed PRs

Preview URLs look like this: `https://[owner].github.io/[repo]/pr-preview/pr-[number]/`

> **Note:** This is a fork of [rossjrw/pr-preview-action](https://github.com/rossjrw/pr-preview-action) that replaces the "Deploy from a branch" code path with artifact-based deployment via `actions/upload-pages-artifact` + `actions/deploy-pages`.

# Setup

In your repository **Settings** > **Pages**, set the source to **GitHub Actions** (not "Deploy from a branch").

# Usage

Call the reusable workflow from your PR workflow:

```yaml
# .github/workflows/preview.yml
name: Deploy PR previews

on:
    pull_request:
        types: [opened, reopened, synchronize]

jobs:
    deploy-preview:
        uses: PazerOP/pr-preview-action/.github/workflows/preview.yml@v1
        with:
            source-dir: ./build/
        secrets: inherit
```

That's it. Permissions, concurrency, fork safety, and the GitHub Pages environment are all handled internally by the reusable workflow. You don't need to configure any of that. Cleanup of closed PR previews happens automatically during every deploy.

If your site needs a build step, add a separate job and pass the artifact name:

```yaml
name: Deploy PR previews

on:
    pull_request:
        types: [opened, reopened, synchronize]

jobs:
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

The `artifact-name` input tells the workflow to download the named artifact instead of checking out the repository.

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

1. **Restore snapshot**: Downloads the `gh-pages-snapshot` artifact from the most recent successful deploy (any branch). On hit the git clone is skipped entirely. Falls back to clone on miss.
2. **Push to branch**: Force-pushes the resolved tree (existing branch contents + the per-PR deploy + cleanup of closed PR previews) as a single-commit orphan to the `gh-pages` branch
3. **Upload snapshot**: Uploads the full deployment as a `gh-pages-snapshot` artifact (7-day retention) for the next run's restore and for disaster recovery
4. **Upload Pages artifact**: Uploads the tree as a Pages artifact via `actions/upload-pages-artifact`
5. **Deploy**: Deploys the artifact to GitHub Pages via `actions/deploy-pages`
6. **Comment**: Posts/updates a sticky PR comment with the preview URL
7. **Status**: Sets commit statuses (pending -> success/failure) on the PR head SHA

The `gh-pages` branch serves as the source of truth for all content (production + all PR previews). Each deployment uploads the **entire** branch as a single artifact, since `actions/deploy-pages` replaces the whole site.

### Single-commit branch

Each run replaces `gh-pages` with **one orphan commit** containing the post-update tree. The previous history is discarded. This stops the branch from accumulating preview artifacts (which can be large and per-build unique, e.g. cross-compiled binaries) that are unreachable after the next push but otherwise stay in history forever. To make this safe, the workflow serializes all writes globally per repository via a `pr-preview-action-<repo>` concurrency group with `cancel-in-progress: false`. If you have tooling that depends on `gh-pages` history, expect each run to look like a fresh root commit.

# Considerations

## Ensure your main deployment is compatible

If you use GitHub Actions to deploy your main site (e.g. on push to main), configure it to not delete the preview umbrella directory when pushing to `gh-pages`.

# Acknowledgements

-   [rossjrw/pr-preview-action](https://github.com/rossjrw/pr-preview-action) (MIT), the original action this is forked from
