#!/usr/bin/env bash
# Run the preview deploy/remove pipeline directly (replaces `uses: ./` from composite action).
# Usage: bash test/lib/run-preview.sh
#
# Required env vars (set by caller):
#   INPUT_ACTION        - deploy, remove, or auto
#   INPUT_UMBRELLA_DIR  - umbrella directory
#   INPUT_PR_NUMBER     - PR number or test ID
#   INPUT_BRANCH        - preview branch name (INPUT_BRANCH for git-update, maps to preview-branch)
#   INPUT_TOKEN         - GitHub token
#   INPUT_SOURCE_DIR    - source directory (deploy only)
#   INPUT_COMMIT_MESSAGE - commit message
#   INPUT_COMMENT       - "true" or "false"
#
# Optional:
#   INPUT_PAGES_BASE_URL
#   INPUT_PAGES_BASE_PATH
#   INPUT_ACTION_REF

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

# Run setup to compute deployment_action, preview_file_path, etc.
export INPUT_ACTION_REF="${INPUT_ACTION_REF:-test}"
export INPUT_PAGES_BASE_URL="${INPUT_PAGES_BASE_URL:-}"
export INPUT_PAGES_BASE_PATH="${INPUT_PAGES_BASE_PATH:-}"
node "$SCRIPT_DIR/dist/setup.js"

# Source GITHUB_ENV to get the computed variables
if [ -n "$GITHUB_ENV" ] && [ -f "$GITHUB_ENV" ]; then
    while IFS= read -r line; do
        export "$line"
    done < "$GITHUB_ENV"
fi

# Run the appropriate action
if [ "$deployment_action" = "deploy" ]; then
    export INPUT_TARGET_PATH="$preview_file_path"
    node "$SCRIPT_DIR/dist/git-update.js" deploy
elif [ "$deployment_action" = "remove" ]; then
    export INPUT_TARGET_PATH="$preview_file_path"
    node "$SCRIPT_DIR/dist/git-update.js" remove
else
    echo "No action needed (deployment_action=$deployment_action)"
fi
