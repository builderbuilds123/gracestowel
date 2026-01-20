#!/bin/bash
START_ID="21160080371"
echo "Starting watcher for new run (Baseline: $START_ID)"
for i in {1..60}; do
  LATEST_ID=$(gh run list --branch feat/local-admin-notifications --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId')
  echo "[$(date)] Check $i: Latest is $LATEST_ID"
  
  # Check if LATEST_ID is valid and different from baseline
  if [ "$LATEST_ID" != "" ] && [ "$LATEST_ID" != "null" ] && [ "$LATEST_ID" != "$START_ID" ]; then
    echo "Found new run: $LATEST_ID. Watching..."
    gh run watch "$LATEST_ID" --exit-status
    EXIT_CODE=$?
    echo "Run finished with code $EXIT_CODE"
    exit $EXIT_CODE
  fi
  sleep 10
done
echo "Timeout: No new run appeared."
exit 1
