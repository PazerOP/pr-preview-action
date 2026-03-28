#!/usr/bin/env bash

set -e

source "$(dirname "$0")/../lib/assert.sh"

# Ensure ts-node is available
if ! pnpm exec ts-node --version &>/dev/null; then
    echo "ts-node not found, installing dependencies..."
    pnpm install --frozen-lockfile
fi

# Test configuration
export GITHUB_REPOSITORY="test-owner/test-repo"
export GITHUB_SERVER_URL="https://github.com"
export GITHUB_API_URL="https://api.github.com"
export action_version="v1.0.0-test"
export preview_url="https://test-owner.github.io/test-repo/pr-preview/pr-12345/?v=abc1234"
export action_start_time="2025-01-01 12:00 UTC"
export INPUT_PREVIEW_BRANCH="gh-pages"
export INPUT_COMMENT="true"
export INPUT_QR_CODE=""
export DRY_RUN="true"
export deployment_action="deploy"

comment_file="comment-generated.md"

echo >&2 "test comment: deployment"
echo >&2 "==============================="
pnpm exec ts-node src/comment.ts > "$comment_file"
cat >&2 "$comment_file"
echo >&2 "==============================="

assert_file_contains "$comment_file" "PR Preview Action"
assert_file_contains "$comment_file" "$action_version"
assert_file_contains "$comment_file" "$preview_url"
assert_file_contains "$comment_file" "pr-preview"
# No QR code when provider is empty
assert_file_contains "$comment_file" "/?url=" && exit 1 || true

echo >&2 "test comment: removal"
echo >&2 "==============================="
export deployment_action="remove"
pnpm exec ts-node src/comment.ts > "$comment_file"
cat >&2 "$comment_file"
echo >&2 "==============================="

assert_file_contains "$comment_file" "PR Preview Action"
assert_file_contains "$comment_file" "$action_version"
assert_file_contains "$comment_file" "Preview removed"
assert_file_contains "$comment_file" "/?url=" && exit 1 || true

echo >&2 "test comment: deployment with QR code"
echo >&2 "==============================="
export deployment_action="deploy"
export INPUT_QR_CODE="https://qr.example.com/?url="
pnpm exec ts-node src/comment.ts > "$comment_file"
export INPUT_QR_CODE=""
cat >&2 "$comment_file"
echo >&2 "==============================="

assert_file_contains "$comment_file" "qr.example.com/?url=$preview_url"

echo >&2 "test comment: deployment with QR code, backwards compatibility with qr-code:true"
echo >&2 "==============================="
export INPUT_QR_CODE="true"
pnpm exec ts-node src/comment.ts > "$comment_file"
export INPUT_QR_CODE=""
cat >&2 "$comment_file"
echo >&2 "==============================="

assert_file_contains "$comment_file" "qr.rossjrw.com"
