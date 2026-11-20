# Plan: Work summary UI prototypes

## Brief

Create three HTML prototypes for the work summary display. Show tools, duration, the answering model, and start time for each group. Let the user choose a design before changing the extension.

## Current state / relevant context

- The extension shows tool counts, duration, and a short summary.
- Thinking stays unchanged and does not get generated summaries.
- `pi-jev-router` can change the answering model. Its current routes use Luna, Sol, and Astra.
- `pi-message-timestamps` supplies separate message times. Keep it installed until the user approves a replacement.
- The user suggested `FammasMaz/pi-cc-tools` as a visual reference.
- The repository has no `docs/CONTEXT.md`.
- Existing extension files and the unrelated router edit must stay unchanged during this prototype phase.

## Proposed implementation

Create one self-contained HTML page with three terminal-style designs. A terminal-style design uses fixed-width text and colors that Pi can show. Use simulated data, not live conversations or model requests.

Give every design the same tools, start times, durations, models, and summaries. Include completed work, running work, and a model change. Show model names from the answering models, not the summary model or `jev/auto`.

Allow the user to compare all designs or enlarge one design. Include narrow and light views. Allow tool details to expand. Keep these controls outside the simulated Pi display except the tool expansion control.

Use plain HTML, CSS, and JavaScript. Add no dependencies, network calls, fonts, or installation changes. The browser page is a design aid, not a working Pi integration.

## File-by-file impact

- `prototypes/pi-work-summary/index.html`: three layouts, sample groups, and preview controls.
- `prototypes/pi-work-summary/prototypes.test.mjs`: small checks for sample data and page requirements.
- This plan: decisions, launch instructions, and browser check results.
- No production extension or live settings changes in this phase.

## Risks and edge cases

- Browser features can suggest a design that a terminal cannot show. Keep text size fixed inside the terminal samples.
- Long model names and multiple routed models must fit narrow widths without losing information.
- Failure and running states need text labels, not color alone.
- The existing timestamp extension can create duplicate times in a future integration. Do not retire it during this phase.

## Validation / testing

- Run the Node checks for the page and simulated data.
- Open the page in a real browser with ProofShot.
- Check each design, the comparison view, narrow widths, light colors, and tool expansion.
- Check that tools, duration, answering models, and start times appear in each design.
- Capture preview images and check browser errors.
- Run `git diff --check` and `pre-commit run --all-files`. Include new files in the secret check.

## Step-by-step execution checklist

- [x] Inspect the reference and the model metadata source.
- [x] Build three distinct layouts with the same sample groups.
- [x] Check the page and capture previews.
- [x] Present the HTML path and stop for the user's choice.

## Verified results

`node prototypes/pi-work-summary/prototypes.test.mjs` passed.

ProofShot checks passed in real Chromium for all three designs at 390px and 1800px widths. The checks covered dark and light views, tool expansion, failure states, all four metadata fields, and a direct file URL. They also confirmed the answering-model change from `gpt-6.1-sol` to `gpt-6.2-astra`. Browser and server errors: zero.

The initial recording command timed out after startup. Session recovery succeeded, and the final ProofShot stop succeeded. Artifacts: `/tmp/pi-work-summary-proof.by5kcD/proof/2026-11-19_23-51-16_compare-three-work-summary-prototypes-mo/`.

No extension or live settings changed in this phase. `git diff --check` and `pre-commit run --all-files` passed. The secret check also covered the new files.

The user chose B Ledger. Its time-led display is implemented in `extensions/pi-work-summary/`. The footer shows chronological provider/model transitions, duration, and state. The local clock appears beside the tools, with a thin rule and summary below. Missing model data appears as `Model unknown`. Native thinking and `pi-message-timestamps` remain unchanged. Legacy saved groups recover models from branch messages without model requests. Restart Pi after installation.

The extension tests and strict TypeScript check passed. Isolated offline terminal checks at 110 and 52 columns passed for coexistence and replay. No live router run was performed.

## Open questions / assumptions

- The selected layout is B Ledger.
- Start times use local time and a 24-hour clock in the samples.
- A group can show more than one answering model when routing changes.
- The summary wording rules remain unchanged.
- Open `prototypes/pi-work-summary/index.html` directly in a browser. No server is necessary for normal use.
