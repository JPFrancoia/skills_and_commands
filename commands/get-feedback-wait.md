---
description: Block until reviewer submits feedback
---

Run `monocle review get-feedback --wait` to block until your reviewer submits feedback through Monocle.

## Handling the response

- Read the feedback carefully and act on it; the feedback contains your reviewer's comments, issues, and suggestions about your code changes
- Address the reviewer's comments in your code
- If Monocle reports multiple running sessions, ask the user which listed repo to use, then rerun with `-C <chosen repo>`
- If the reviewer requested changes, run `monocle review get-feedback --wait` again after addressing the feedback
- Keep iterating until the reviewer approves
