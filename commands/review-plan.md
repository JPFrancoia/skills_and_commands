---
description: Send a plan to Monocle for review
---

Submit a plan file to Monocle so the reviewer can see it. Does NOT wait for feedback; use `/review-plan-wait` to block until the reviewer responds.

**Important:** This is for content that isn't already a tracked file change: plans, architecture docs, summaries, etc. You do NOT need to send regular code files; Monocle automatically picks up file changes.

## Steps

1. **Find the plan file**: if the user provided a path as an argument, use that. Otherwise, find the most recently modified plan file in the project.

2. **Read the plan file** to confirm it exists and get its filename.

3. **Run `monocle review send-artifact`** with:
   - `--title`: The first markdown heading from the plan, or the filename if no heading found
   - `--file`: Absolute path to the plan file
   - `--id`: The plan filename (e.g. `my-plan.md`), which ensures updates replace the previous version
   - `--type`: `md`

4. If Monocle reports multiple running sessions, ask the user which listed repo to use, then rerun with `-C <chosen repo>`.

5. **Confirm** to the user that the plan was sent to Monocle.
