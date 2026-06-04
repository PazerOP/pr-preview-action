#!/usr/bin/env bash

set -e

source "$(dirname "$0")/../lib/assert.sh"

FIXTURES_DIR="$(dirname "$0")/../fixtures/events"

echo >&2 "test setup: PR preview URL (default server)"
echo >&2 "==============================="

export GITHUB_ENV=$(mktemp)
export GITHUB_OUTPUT=$(mktemp)
export GITHUB_EVENT_NAME="pull_request"
export GITHUB_EVENT_PATH="$FIXTURES_DIR/pr-opened.json"
export GITHUB_REPOSITORY="test-owner/test-repo"
export INPUT_ACTION="deploy"
export INPUT_BUILDHOST_SERVER=""
export INPUT_PROJECT=""
export INPUT_PR_NUMBER="42"
export INPUT_ACTION_REF="v1.0.0"

node dist/setup.js

env_content=$(cat "$GITHUB_ENV")
output_content=$(cat "$GITHUB_OUTPUT")

echo >&2 "ENV content:"
echo >&2 "$env_content"
echo >&2 "OUTPUT content:"
echo >&2 "$output_content"

assert_contains "$output_content" "deployment_action=deploy"
assert_contains "$output_content" "buildhost_server=https://pazer.build"
assert_contains "$output_content" "buildhost_project=test-repo"
assert_contains "$output_content" "site_branch=pr-42"
assert_contains "$output_content" "preview_base_url=https://sites.pazer.build/test-repo/branch/pr-42/"
assert_contains "$output_content" "short_sha=abc1234"
assert_contains "$output_content" "preview_url=https://sites.pazer.build/test-repo/branch/pr-42/?v=abc1234"
assert_contains "$output_content" "action_version=v1.0.0"

echo >&2 "test setup: auto action for close event removes the preview"
echo >&2 "==============================="

export GITHUB_ENV=$(mktemp)
export GITHUB_OUTPUT=$(mktemp)
export INPUT_ACTION="auto"
export GITHUB_EVENT_PATH="$FIXTURES_DIR/pr-closed.json"

node dist/setup.js

output_content=$(cat "$GITHUB_OUTPUT")
assert_contains "$output_content" "deployment_action=remove"
assert_contains "$output_content" "site_branch=pr-42"

echo >&2 "test setup: custom buildhost server and project"
echo >&2 "==============================="

export GITHUB_ENV=$(mktemp)
export GITHUB_OUTPUT=$(mktemp)
export GITHUB_EVENT_PATH="$FIXTURES_DIR/pr-opened.json"
export INPUT_ACTION="deploy"
export INPUT_BUILDHOST_SERVER="https://buildhost.example.com"
export INPUT_PROJECT="my-docs"

node dist/setup.js

output_content=$(cat "$GITHUB_OUTPUT")
assert_contains "$output_content" "buildhost_server=https://buildhost.example.com"
assert_contains "$output_content" "buildhost_project=my-docs"
assert_contains "$output_content" "preview_url=https://sites.buildhost.example.com/my-docs/branch/pr-42/?v=abc1234"

echo >&2 "test setup: push event auto-resolves to deploy under the branch name"
echo >&2 "==============================="

export GITHUB_ENV=$(mktemp)
export GITHUB_OUTPUT=$(mktemp)
export GITHUB_EVENT_NAME="push"
export GITHUB_EVENT_PATH="$FIXTURES_DIR/push.json"
export GITHUB_REPOSITORY="test-owner/test-repo"
export GITHUB_REF="refs/heads/main"
# GITHUB_REF_NAME is set by GitHub per event; set it explicitly so the runner's
# ambient value (the real branch) doesn't leak into the test.
export GITHUB_REF_NAME="main"
export GITHUB_SHA="fedcba9876543210"
export INPUT_ACTION="auto"
export INPUT_BUILDHOST_SERVER=""
export INPUT_PROJECT=""
export INPUT_PR_NUMBER=""
export INPUT_ACTION_REF="v1.0.0"

node dist/setup.js

output_content=$(cat "$GITHUB_OUTPUT")

echo >&2 "OUTPUT content:"
echo >&2 "$output_content"

assert_contains "$output_content" "deployment_action=deploy"
assert_contains "$output_content" "site_branch=main"
assert_contains "$output_content" "preview_url=https://sites.pazer.build/test-repo/branch/main/?v=fedcba9"
assert_contains "$output_content" "short_sha=fedcba9"

echo >&2 "test setup: push to non-default branch returns none"
echo >&2 "==============================="

export GITHUB_ENV=$(mktemp)
export GITHUB_OUTPUT=$(mktemp)
export GITHUB_REF="refs/heads/feature-branch"
export GITHUB_REF_NAME="feature-branch"

node dist/setup.js

output_content=$(cat "$GITHUB_OUTPUT")

echo >&2 "OUTPUT content:"
echo >&2 "$output_content"

assert_contains "$output_content" "deployment_action=none"

echo >&2 "test setup: PR head SHA wins over GITHUB_SHA"
echo >&2 "==============================="

export GITHUB_ENV=$(mktemp)
export GITHUB_OUTPUT=$(mktemp)
export GITHUB_EVENT_NAME="pull_request"
export GITHUB_EVENT_PATH="$FIXTURES_DIR/pr-opened.json"
export GITHUB_SHA="1111111222222233"
export INPUT_ACTION="deploy"
export INPUT_PR_NUMBER="42"

node dist/setup.js

output_content=$(cat "$GITHUB_OUTPUT")
# pr-opened.json has a PR head SHA, so it should win over GITHUB_SHA
assert_contains "$output_content" "short_sha=abc1234"
