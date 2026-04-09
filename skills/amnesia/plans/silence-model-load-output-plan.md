# Completed - 2026-04-09

## Goal
Silence model-loading progress output from `save.py` so agents get clean startup/query output.

## Plan
- [x] Identify where model initialization happens and where noisy output originates.
- [x] Add targeted suppression around model initialization only (not around normal command output).
- [x] Keep existing behavior for success/errors and verify script still initializes and queries normally.

## Notes
- Noise source is `SentenceTransformer("all-mpnet-base-v2")` initialization in `get_model()`.
- Suppression is scoped to model initialization and logging/progress controls for HF/transformers.
- Verified with `./save.py query "test" -n 1`: output is clean and no model-loading bar/warnings are emitted.
