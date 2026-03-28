#!/usr/bin/env bash

set -e

source "$(dirname "$0")/../lib/assert.sh"

# Ensure ts-node is available
if ! pnpm exec ts-node --version &>/dev/null; then
    echo "ts-node not found, installing dependencies..."
    pnpm install --frozen-lockfile
fi

echo >&2 "test setup: pages base URL calculation"
echo >&2 "==============================="

# Create temp files for GITHUB_ENV and GITHUB_OUTPUT
export GITHUB_ENV=$(mktemp)
export GITHUB_OUTPUT=$(mktemp)
export GITHUB_EVENT_NAME="pull_request"
export GITHUB_REPOSITORY="test-owner/test-repo"
export INPUT_ACTION="deploy"
export INPUT_UMBRELLA_DIR="pr-preview"
export INPUT_PAGES_BASE_URL=""
export INPUT_PAGES_BASE_PATH=""
export INPUT_PR_NUMBER="42"
export INPUT_ACTION_REF="v1.0.0"

# Create a mock event file
event_file=$(mktemp)
cat > "$event_file" << 'EVENTEOF'
{
  "action": "opened",
  "pull_request": {
    "head": {
      "sha": "abc1234567890def"
    }
  }
}
EVENTEOF
export GITHUB_EVENT_PATH="$event_file"

pnpm exec ts-node src/setup.ts

# Read outputs
env_content=$(cat "$GITHUB_ENV")
output_content=$(cat "$GITHUB_OUTPUT")

echo >&2 "ENV content:"
echo >&2 "$env_content"
echo >&2 "OUTPUT content:"
echo >&2 "$output_content"

assert_contains "$output_content" "deployment_action=deploy"
assert_contains "$output_content" "pages_base_url=test-owner.github.io/test-repo"
assert_contains "$output_content" "preview_url_path=pr-preview/pr-42"
assert_contains "$output_content" "preview_url=https://test-owner.github.io/test-repo/pr-preview/pr-42/"
assert_contains "$output_content" "short_sha=abc1234"
assert_contains "$output_content" "preview_url_cached=https://test-owner.github.io/test-repo/pr-preview/pr-42/?v=abc1234"
assert_contains "$output_content" "action_version=v1.0.0"
assert_contains "$env_content" "empty_dir_path="

echo >&2 "test setup: auto action for close event"
echo >&2 "==============================="

export GITHUB_ENV=$(mktemp)
export GITHUB_OUTPUT=$(mktemp)
export INPUT_ACTION="auto"
cat > "$event_file" << 'EVENTEOF'
{
  "action": "closed",
  "pull_request": {
    "head": {
      "sha": "def4567890abc123"
    }
  }
}
EVENTEOF

pnpm exec ts-node src/setup.ts

output_content=$(cat "$GITHUB_OUTPUT")
assert_contains "$output_content" "deployment_action=remove"

echo >&2 "test setup: github.io repo URL"
echo >&2 "==============================="

export GITHUB_ENV=$(mktemp)
export GITHUB_OUTPUT=$(mktemp)
export GITHUB_REPOSITORY="myuser/myuser.github.io"
export INPUT_ACTION="deploy"
cat > "$event_file" << 'EVENTEOF'
{
  "action": "opened",
  "pull_request": {
    "head": {
      "sha": "abc1234567890def"
    }
  }
}
EVENTEOF

pnpm exec ts-node src/setup.ts

output_content=$(cat "$GITHUB_OUTPUT")
assert_contains "$output_content" "pages_base_url=myuser.github.io"
assert_contains "$output_content" "preview_url=https://myuser.github.io/pr-preview/pr-42/"

echo >&2 "test setup: custom pages base URL"
echo >&2 "==============================="

export GITHUB_ENV=$(mktemp)
export GITHUB_OUTPUT=$(mktemp)
export GITHUB_REPOSITORY="test-owner/test-repo"
export INPUT_PAGES_BASE_URL="custom.example.com/site"

pnpm exec ts-node src/setup.ts

output_content=$(cat "$GITHUB_OUTPUT")
assert_contains "$output_content" "pages_base_url=custom.example.com/site"
assert_contains "$output_content" "preview_url=https://custom.example.com/site/pr-preview/pr-42/"

# Cleanup
rm -f "$event_file"
