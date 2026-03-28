# Deploy PR Preview action

[GitHub Action](https://github.com/features/actions) that deploys previews of pull requests to [GitHub Pages](https://pages.github.com/) using artifact-based deployment. Works when GitHub Pages is configured with source set to **GitHub Actions**.

Features:

-   Creates and deploys previews of pull requests to your GitHub Pages site
-   Leaves a comment on the pull request with a link to the preview so that you and your team can collaborate on new features faster
-   Updates the deployment and the comment whenever new commits are pushed to the pull request
-   Includes a QR code in the preview comment for easy mobile access
-   Sets commit statuses on the PR head SHA to indicate deployment progress
-   Cache-busted preview URLs ensure you always see the latest content
-   Cleans up after itself &mdash; removes deployed previews when the pull request is closed

Preview URLs look like this: `https://[owner].github.io/[repo]/pr-preview/pr-[number]/`

> **Note:** This is a fork of [rossjrw/pr-preview-action](https://github.com/rossjrw/pr-preview-action) that replaces the "Deploy from a branch" code path with artifact-based deployment via `actions/upload-pages-artifact` + `actions/deploy-pages`.

# Setup

## 1. Configure Pages source

In your repository **Settings** > **Pages**, set the source to **GitHub Actions** (not "Deploy from a branch").

## 2. Set workflow permissions

Your workflow must declare these permissions:

```yaml
permissions:
    contents: write       # push to gh-pages branch
    pull-requests: write  # post sticky comments
    pages: write          # deploy Pages artifact
    id-token: write       # required by actions/deploy-pages
    statuses: write       # set commit statuses (optional)
```

Alternatively, in **Settings** > **Actions** > **General** > **Workflow permissions**, select "Read and write permissions".

# Usage

```yaml
# .github/workflows/preview.yml
name: Deploy PR previews

on:
    pull_request:
        types:
            - opened
            - reopened
            - synchronize
            - closed

permissions:
    contents: write
    pull-requests: write
    pages: write
    id-token: write
    statuses: write

concurrency: preview-${{ github.ref }}

jobs:
    deploy-preview:
        runs-on: ubuntu-latest
        steps:
            - name: Checkout
              uses: actions/checkout@v4

            - name: Install and Build
              if: github.event.action != 'closed'
              run: |
                  npm install
                  npm run build

            - name: Deploy preview
              uses: PazerOP/pr-preview-action@v1
              with:
                  source-dir: ./build/
                  preview-branch: gh-pages
```

## Inputs (configuration)

All parameters are optional and have default values.

| Input&nbsp;parameter | Description |
| --- | --- |
| `source-dir` | Directory containing files to deploy. E.g. `./dist/` or `./build/`. <br><br> Default: `.` (repository root) |
| `preview-branch` | Branch to save previews to. This branch stores all preview content and is used as the source of truth for Pages deployment. <br><br> Default: `gh-pages` |
| `umbrella-dir` | Path to the directory containing all previews. <br><br> Default: `pr-preview` |
| `pr-number` | The PR number to use for the preview path. <br><br> Default: `${{ github.event.number }}` |
| `pages-base-url` | Base URL of the GitHub Pages site. <br><br> Default: Calculated from repository name |
| `pages-base-path` | Path that GitHub Pages is served from. <br><br> Default: `.` |
| `comment` <br> (boolean) | Whether to leave a sticky comment on the PR. <br><br> Default: `true` |
| `qr-code` | QR code provider URL, or `"false"` to disable. <br><br> Default: `https://qr.rossjrw.com/?color.dark=0d1117&url=` |
| `token` | Authentication token. <br><br> Default: `${{ github.token }}` |
| `action` <br> (enum) | `deploy`, `remove`, or `auto`. <br> `auto` deploys on `opened`/`reopened`/`synchronize` and removes on `closed`. <br><br> Default: `auto` |
| `commit-status-context` | The context string for commit statuses set on the PR head SHA. <br><br> Default: `"Preview"` |

<details>
<summary><b>Extra parameters for controlling the commits</b></summary>

| Input&nbsp;parameter | Description |
| --- | --- |
| `deploy-commit-message` | Commit message when adding/updating a preview. <br><br> Default: `Deploy preview for PR ${{ github.event.number }}` |
| `remove-commit-message` | Commit message when removing a preview. <br><br> Default: `Remove preview for PR ${{ github.event.number }}` |

</details>

## Outputs

| Output | Description |
| --- | --- |
| `deployment-action` | Resolved value of the `action` input (deploy, remove, none). |
| `pages-base-url` | Base URL of the GitHub Pages site. |
| `preview-url-path` | Path to the preview from the base URL. |
| `preview-url` | Full URL to the preview (includes `?v={short_sha}` cache-busting param). |
| `action-version` | Version of this Action when it was run. |
| `action-start-timestamp` | Unix timestamp when the action started. |
| `action-start-time` | Human-readable start time (UTC). |

## How it works

1. **Push to branch**: Pushes preview files to a subdirectory on the `gh-pages` branch
2. **Upload artifact**: Checks out the full `gh-pages` branch and uploads it as a Pages artifact via `actions/upload-pages-artifact`
3. **Deploy**: Deploys the artifact to GitHub Pages via `actions/deploy-pages`
4. **Comment**: Posts/updates a sticky PR comment with the preview URL
5. **Status**: Sets commit statuses (pending → success/failure) on the PR head SHA

The `gh-pages` branch serves as the source of truth for all content (production + all PR previews). Each deployment uploads the **entire** branch as a single artifact, since `actions/deploy-pages` replaces the whole site.

# Considerations

## Ensure your main deployment is compatible

If you use GitHub Actions to deploy your main site (e.g. on push to main), configure it to not delete the preview umbrella directory when pushing to `gh-pages`.

## Set a concurrency group

Use a [concurrency group](https://docs.github.com/en/actions/using-jobs/using-concurrency) scoped to each PR to prevent race conditions:

```yaml
concurrency: preview-${{ github.ref }}
```

# Acknowledgements

-   [rossjrw/pr-preview-action](https://github.com/rossjrw/pr-preview-action) (MIT), the original action this is forked from
