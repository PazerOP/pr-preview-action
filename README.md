# Deploy PR Preview

Deploy previews of pull requests to [buildhost](https://github.com/wow-look-at-my/buildhost) static sites.

Features:

-   Deploys each pull request to its own buildhost site branch (`pr-<number>`)
-   Leaves a comment on the pull request with a link to the preview so that you and your team can collaborate on new features faster
-   Updates the deployment and the comment whenever new commits are pushed to the pull request
-   Sets commit statuses on the PR head SHA to indicate deployment progress
-   Cleans up after itself &mdash; the preview is deleted when the PR is closed
-   Authenticates to buildhost with GitHub Actions OIDC, so no static secret is required

Preview URLs look like this: `https://sites.[buildhost-domain]/[project]/branch/pr-[number]/`

> **Note:** This is a fork of [rossjrw/pr-preview-action](https://github.com/rossjrw/pr-preview-action) that deploys to buildhost static sites instead of GitHub Pages.

# Setup

No repository settings are required. The preview is uploaded to buildhost over
HTTPS, authenticated with a short-lived GitHub Actions OIDC token. buildhost
trusts GitHub Actions OIDC directly and **auto-provisions the project** from the
token's repository claim on the first upload, so there is nothing to create
ahead of time.

The only requirement is that the calling workflow grants `id-token: write` (for
OIDC). If your buildhost server is not configured for OIDC, provide a
`BUILDHOST_TOKEN` repository secret with `write` scope instead.

# Usage

Call the reusable workflow from your PR workflow:

```yaml
# .github/workflows/preview.yml
name: Deploy PR previews

on:
    pull_request:
        types: [opened, reopened, synchronize, closed]

permissions:
    contents: read
    pull-requests: write
    statuses: write
    id-token: write

jobs:
    deploy-preview:
        uses: PazerOP/pr-preview-action/.github/workflows/preview.yml@v1
        with:
            source-dir: ./build/
            buildhost-server: https://pazer.build
        secrets: inherit
```

Include `closed` in the `types` list so the preview is removed when the PR is
closed. The permissions block is required &mdash; a reusable workflow cannot
escalate beyond the permissions the caller grants.

If your site needs a build step, build it in a separate job and pass the
artifact name:

```yaml
name: Deploy PR previews

on:
    pull_request:
        types: [opened, reopened, synchronize, closed]

permissions:
    contents: read
    pull-requests: write
    statuses: write
    id-token: write

jobs:
    build:
        runs-on: ubuntu-latest
        if: github.event.action != 'closed'
        steps:
            - uses: actions/checkout@v6
            - run: npm install && npm run build
            - uses: actions/upload-artifact@v4
              with:
                  name: build
                  path: ./build/

    deploy-preview:
        needs: build
        if: always()
        uses: PazerOP/pr-preview-action/.github/workflows/preview.yml@v1
        with:
            artifact-name: build
        secrets: inherit
```

The `artifact-name` input tells the workflow to download the named artifact
instead of checking out the repository. The build job is skipped on PR close
(`if: github.event.action != 'closed'`), and `if: always()` on the deploy job
ensures the close cleanup still runs.

## Inputs

All parameters are optional. Either `source-dir` or `artifact-name` must be provided.

| Input&nbsp;parameter | Description |
| --- | --- |
| `source-dir` | Directory containing files to deploy. E.g. `./dist/` or `./build/`. Required when `artifact-name` is not set. <br> Default: `"."` |
| `artifact-name` | Name of a previously-uploaded artifact to deploy. When set, the checkout of `source-dir` is skipped and the artifact is downloaded instead. |
| `buildhost-server` | Base URL of the buildhost server. Service subdomains (`sites.`, ...) are derived from this. <br> Default: `https://pazer.build` |
| `project` | buildhost project name. <br> Default: the repository name (matching buildhost's OIDC auto-provisioning). |
| `action` | `deploy`, `remove`, or `auto`. `auto` deploys on `opened`/`reopened`/`synchronize` and removes the preview on `closed`. <br> Default: `auto` |
| `comment` | Whether to leave a sticky comment on the PR. <br> Default: `"true"` |
| `commit-status-context` | The context string for commit statuses. <br> Default: `"Preview"` |
| `pr-number` | The PR number to use for the preview branch (`pr-<number>`). <br> Default: from event context |

## Secrets

| Secret | Description |
| --- | --- |
| `BUILDHOST_TOKEN` | Optional. A buildhost API token with `write` scope. When omitted, the action authenticates with a GitHub Actions OIDC token (requires `id-token: write`). Pass it through with `secrets: inherit`. |

## Outputs

| Output | Description |
| --- | --- |
| `deployment-action` | Resolved value of the `action` input (`deploy`, `remove`, `none`). |
| `preview-url` | Full URL to the preview (includes `?v={short_sha}` cache-busting param). |

## How it works

On a pull request the action packages `source-dir` (or the downloaded artifact)
into a `tar.gz`, mints a GitHub Actions OIDC token (or uses `BUILDHOST_TOKEN`),
and `PUT`s the archive to the buildhost sites endpoint:

```
PUT https://sites.{buildhost-domain}/{project}/branch/pr-{number}
```

buildhost stores each branch as an independent deployment and replaces it
atomically on every push, so there is no shared mutable branch to race &mdash;
each PR writes only to its own `pr-<number>` site branch. The preview is served
at:

```
https://sites.{buildhost-domain}/{project}/branch/pr-{number}/
```

A small cache-bust script is injected into the deployed HTML, and the preview
URL carries a `?v={short_sha}` parameter so reviewers always land on the latest
build.

When the PR is closed, the action issues a `DELETE` for the same branch to tear
the preview down.

A push to the repository's default branch deploys to a site branch named after
that branch (for example `main`), giving a stable, non-preview site URL.

# Acknowledgements

-   [rossjrw/pr-preview-action](https://github.com/rossjrw/pr-preview-action) (MIT), the original action this is forked from
