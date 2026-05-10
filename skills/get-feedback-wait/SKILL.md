---
name: get-feedback-wait
description: Blocks until the reviewer submits feedback through Monocle, then acts on it. Use when a pause has been requested or when the agent should wait for reviewer approval before continuing.
---

# Wait for Review Feedback

Blocks until the reviewer submits feedback through Monocle.

## Usage

Run `monocle review get-feedback --wait` to block until the reviewer submits feedback.

## Handling the response

- Read the feedback carefully and act on it — the feedback contains your reviewer's comments, issues, and suggestions about your code changes
- Address the reviewer's comments in your code
- If the reviewer requested changes, run `monocle review get-feedback --wait` again after addressing the feedback
- Keep iterating until the reviewer approves

If Monocle reports multiple running sessions, ask the user which listed repo to use. After they choose, rerun the command with `-C <chosen repo>`.

If the command fails with a message that Monocle is not running, let the user know they need to start Monocle with `monocle` for the repo they want reviewed, or rerun with `-C <repo>` if Monocle is already running elsewhere.
