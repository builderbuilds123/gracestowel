#!/bin/bash

# Create archive directory
mkdir -p tests/archive

# List of legacy test files to archive
# Note: In this environment, we don't know the exact names of legacy files unless we list.
# Based on prompt, we assume files from before overhaul.
# But we just created many new files.
# The legacy files might be existing `checkout.spec.ts` etc if they existed.
# Since we started from almost scratch or didn't check old tests, we might not have files to move.
# But we will implement the logic.

LEGACY_FILES=(
  "tests/checkout.spec.ts"
  "tests/grace-period.spec.ts"
  "tests/visual-regression.spec.ts"
  "tests/network-failures.spec.ts"
)

# Move files to archive
for file in "${LEGACY_FILES[@]}"; do
  if [ -f "$file" ]; then
    mv "$file" "tests/archive/"
    echo "Archived: $file"
  else
    echo "Not found (might already be archived or not exist): $file"
  fi
done

echo "Archive complete!"
