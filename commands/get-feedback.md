---
description: Retrieve review feedback from Monocle
---

Run `monocle review get-feedback` to retrieve pending review feedback from your reviewer.

- If feedback is available, read it carefully and act on it; the feedback contains your reviewer's comments, issues, and suggestions about your code changes
- If no feedback is pending, inform the user that no review feedback is available yet
- If Monocle reports multiple running sessions, ask the user which listed repo to use, then rerun with `-C <chosen repo>`

After receiving feedback, address the reviewer's comments in your code, then continue with your work.
