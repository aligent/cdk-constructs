#!/usr/bin/env bash
set -euo pipefail

# Creates a changeset for bot PRs (Dependabot, Aikido, etc.)
# Detects which dependencies were updated and which packages use them.
#
# Usage:
#   .github/scripts/create-bot-changeset.sh <base-ref> <pr-number> <pr-title>
#
# Example (local testing):
#   .github/scripts/create-bot-changeset.sh main 9999 "Bump minimatch"
#
# Set DRY_RUN=1 to preview without writing files:
#   DRY_RUN=1 .github/scripts/create-bot-changeset.sh main 9999 "Bump minimatch"

BASE="${1:?Usage: $0 <base-ref> <pr-number> <pr-title>}"
PR_NUMBER="${2:?Usage: $0 <base-ref> <pr-number> <pr-title>}"
PR_TITLE="${3:?Usage: $0 <base-ref> <pr-number> <pr-title>}"
DRY_RUN="${DRY_RUN:-0}"

CHANGESET_NAME="bot-pr-${PR_NUMBER}"
CHANGESET_FILE=".changeset/${CHANGESET_NAME}.md"

# Check for existing changeset
if [ -f "$CHANGESET_FILE" ]; then
  echo "Changeset already exists: ${CHANGESET_FILE}"
  exit 0
fi

# Collect updated dependency names from all sources
UPDATED_DEPS=""

# 1. From yarn.lock diff — extract package names from added resolution lines
#    Format: +  resolution: "package-name@npm:x.y.z"
LOCKFILE_DEPS=$(git diff "${BASE}...HEAD" -- yarn.lock | grep -E '^\+\s+resolution:' | sed -E 's/.*"([^@]+)@.*/\1/' | sort | uniq || true)
UPDATED_DEPS="${UPDATED_DEPS}${LOCKFILE_DEPS}"

# 2. From any changed package.json files — extract dependency names from added lines
PKG_JSON_DEPS=$(git diff "${BASE}...HEAD" -- '*/package.json' 'package.json' | grep -E '^\+\s+"[^"]+": "[\^~]?[0-9]' | sed -E 's/^\+\s+"([^"]+)".*/\1/' | sort | uniq || true)
if [ -n "$PKG_JSON_DEPS" ]; then
  UPDATED_DEPS="${UPDATED_DEPS}\n${PKG_JSON_DEPS}"
fi

UPDATED_DEPS=$(echo -e "$UPDATED_DEPS" | sort | uniq | grep -v '^$' || true)

if [ -z "$UPDATED_DEPS" ]; then
  echo "No updated dependencies detected."
  exit 0
fi

echo "Updated dependencies:"
echo "$UPDATED_DEPS"
echo ""

# Resolve transitive dependency graph via yarn.lock to find affected workspace packages
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC2086
PACKAGES=$(node "${SCRIPT_DIR}/resolve-affected-packages.js" $UPDATED_DEPS)

# Filter to only publishable Nx packages (those with a project.json)
FILTERED=""
for pkg in $PACKAGES; do
  for PROJECT_JSON in $(find packages -name project.json -not -path '*/node_modules/*'); do
    PKG_DIR=$(dirname "$PROJECT_JSON")
    PKG_JSON="${PKG_DIR}/package.json"
    [ -f "$PKG_JSON" ] || continue

    PKG_NAME=$(jq -r '.name' "$PKG_JSON")
    if [ "$PKG_NAME" = "$pkg" ]; then
      FILTERED="${FILTERED}${pkg}\n"
      break
    fi
  done
done

PACKAGES=$(echo -e "$FILTERED" | sort | uniq | grep -v '^$' || true)

if [ -z "$PACKAGES" ]; then
  echo "No publishable packages affected."
  exit 0
fi

echo "Affected packages:"
echo "$PACKAGES"
echo ""

# Build the changeset
CHANGESET_CONTENT=$(
  {
    echo "---"
    echo "$PACKAGES" | while IFS= read -r pkg; do
      [ -z "$pkg" ] && continue
      echo "\"$pkg\": patch"
    done
    echo "---"
    echo ""
    echo "$PR_TITLE"
  }
)

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY RUN — would create ${CHANGESET_FILE}:"
  echo "$CHANGESET_CONTENT"
else
  echo "$CHANGESET_CONTENT" > "$CHANGESET_FILE"
  echo "Created ${CHANGESET_FILE}:"
  cat "$CHANGESET_FILE"
fi
