# Custom Pi sidebar

`extensions/pi-sidebar/` provides a fixed right sidebar that replaces Pi's footer. Pi's transcript and editor reflow into the remaining width, so sidebar content does not cover them. Fullscreen rendering is experimental. The extension wraps private TUI rendering and terminal-width fields, so it may break mouse selection, overlays, or future Pi upgrades. There is no proof that it fixes earlier display problems.

## Enable for all sessions

From this repository's root, install the sidebar and remove the separate compaction-count package:

```bash
pi install "$PWD/extensions/pi-sidebar"
pi remove "$PWD/extensions/pi-compaction-count"
```

These commands update the global package list in `~/.pi/agent/settings.json`. New Pi sessions load the sidebar without `-e`. Run `/reload` in each existing session.

The sidebar keeps its own 🧹 compactions row. Removing `pi-compaction-count` prevents the duplicate indicator in Extensions. It does not disable automatic compaction.

To disable the sidebar globally, run this command from the repository root, then reload existing sessions:

```bash
pi remove "$PWD/extensions/pi-sidebar"
```

`/sidebar off` only hides the sidebar for the current process. The extension still owns the footer and suppresses the `rpiv-todo` widget. Do not load it together with `pi-sidebar-tui`, `@esso0428/pi-sidebar`, another custom footer, or another extension that reserves terminal columns.

## Displayed data

- conversation name, with the first user message as fallback;
- model, thinking level, cwd, context use, conversation compaction count, turns, and cost;
- one quota bar, with weekly Codex headroom or the tightest remaining percentage from quota statuses;
- running foreground `subagent` tool children and detached async children from the active session;
- `rpiv-todo` tasks from the active session branch;
- footer indicators from other extensions, including Ponytail;
- open PR/MR counts for configured repositories when `REPOS` is set;
- otherwise, Git changes in the current checkout, dirty worktrees, and discovered independent repositories.

The native footer and `rpiv-todo`'s above-editor widget are hidden because their data is shown in the sidebar.

## Dashboard layout

The sidebar uses Pi's active theme, with side padding and compact section dividers.

- The Conversation section uses compact rows without a surrounding frame.
- Long titles wrap onto two lines before truncation. Long model and quota lines wrap within the available width.
- The model row uses the footer format: `(jev) auto • high → gpt-6-astra • high`.
- 🧹 compactions, 🔄 turns, and 💰 cost appear directly below the working directory with aligned values.
- The `ctx` and `quota` bars end the Conversation section. Each bar has a blank line above it.

The bars use 14 cells when space permits. Partial blocks show small percentages instead of rounding them to an empty bar. Context shows the percentage used and token counts. Quota shows the percentage remaining.

For virtual models, the arrow shows the physical model and thinking level of the latest successful response. Failed and aborted responses do not replace that route. Without a successful response, the model line shows only the selection. Physical model selections do not show an arrow.

Existing `pi-quotas-usage` text appears beside the quota bar. Token-status text appears beneath it. These indicators retain their colors and refresh behavior. The quota line omits the healthy `cap:OK` marker, including colored versions. It retains `cap:REACHED` warnings. They do not repeat in Extensions.

For direct Codex selections, an available weekly account value controls the quota bar. Otherwise, the bar uses the lowest remaining percentage in `pi-quotas-usage`. Multiple windows still share one bar. Status formats without percentages keep their text but show an unknown bar value. An em dash indicates missing data, not zero remaining quota.

Subagents and tasks appear when present. When both are empty, one Activity row says `No tasks or agents yet`. Other extension statuses show their existing keys as labels. Long status text wraps beneath each label.

With `REPOS` set, the Git section shows repository names, count badges, and draft/CI breakdowns. Otherwise, it shows repository names, branches, changed-file counts, and file details. Short terminals limit section content and can omit sections entirely.

## Subagents

The **Subagents** section follows the session metrics. Each agent has a name line and a second line with status, cumulative runtime, and cost.

This includes foreground calls, detached runs, and nested descendants that pi-subagents reports. Entries remain after a child stops and survive reload, compaction, and `/tree` navigation within that branch. A green dot and `Running` mean at least one invocation is running. A red dot and `Stopped` mean none are running.

Runtime and cost combine the agent's invocations (`1m46s · $0.4660`). Parallel child durations are summed. Pending top-level children are not listed, and totals do not carry across Pi sessions. The section refreshes every second. It stays hidden until an agent appears.

Async metrics use pi-subagents' validated run status. The sidebar accepts lifecycle versions 2 and 3, plus the unversioned workflow status from pi-subagents 0.45. Running state also uses event-bus RPC `data.fleet` version 1 as an ephemeral zero-metric fallback. A `subagent` call that omits `async` runs in the background with pi-subagents 0.41. Missing or invalid status data leaves recorded rows and totals intact. Use `/subagents-fleet` for detailed run inspection and controls.

## Weekly Codex quota

For direct Codex selections, the quota bar shows the weekly account percentage remaining, not usage attributed to the current conversation. Its percentage appears beside the bar. A separate line shows `Resets in Xd`, or `Resets in Xh` for less than one day. Session metrics appear before both bars.

The extension resolves the current Codex OAuth token through Pi and queries OpenAI's account-usage endpoint. It refreshes at session start, after completed agent runs, on Codex model selection, and on `/sidebar refresh`. Tokens and responses remain in memory and are never logged or persisted. Pending requests show `Loading account quota…`. Authentication, request, or response failures show `Account quota unavailable`.

## Commands

```text
/sidebar                 Toggle the sidebar
/sidebar on              Show it
/sidebar off             Hide it
/sidebar width 50        Set width for this process (20–80)
/sidebar refresh         Refresh quotas and the active Git mode
/sidebar status          Show current state, width, and repository count
```

The default width is 53 columns. With the 70-column minimum for Pi and a one-column separator, the terminal needs at least 124 columns to show the default-width sidebar. It automatically hides when showing it would leave fewer than 70 columns for Pi.

## Open PR/MR counts

When the `REPOS` environment variable exists, the Git section replaces local changes with open request counts. Use the same comma-separated repository URLs as `pi-open`:

```bash
REPOS=https://github.com/acme/widgets,https://gitlab.example.com/acme/group/gadgets \
  pi --tui-mode fullscreen -e /path/to/extensions/pi-sidebar
```

Each repository shows its total in parentheses directly after its name, like `Essorix/green_slope_core (1)`. The count uses a bold, muted badge without right alignment. The next row splits that total into drafts and two CI groups. Hostnames do not appear.

```text
acme/widgets (4)
1 draft · 2 CI ✓ · 1 CI !
```

- `draft` counts all draft requests, regardless of CI.
- `CI ✓` counts non-draft requests with a successful combined CI status.
- `CI !` counts other non-draft requests, including failed, pending, running, canceled, skipped, or missing CI.

Groups with zero requests stay hidden. Separators appear only between visible groups. The visible counts add up to the repository total. GitHub uses the latest commit's status rollup. GitLab uses the head pipeline status. These groups describe CI, not review approval or mergeability.

Repositories with zero requests stay hidden but remain in the refresh list. If every repository has zero requests, the section shows `No open PRs or MRs`. Loading rows and errors stay visible.

Each refresh reads pages of up to 100 requests. It does not stop at `/open`'s 100-request listing limit. If any page fails, the repository shows `unavailable` instead of partial counts.

GitHub hosts use authenticated `gh`. GitLab hosts use authenticated `glab`. Host detection follows `pi-open`: names must start with `github` or `gitlab`. The sidebar imports its shared repository helper from `extensions/pi-open/repos.ts`. Keep that directory beside `pi-sidebar` when copying these source packages. Loading the `pi-open` extension itself is not required.

Counts refresh at startup and about every five minutes. `/sidebar refresh` bypasses that interval. Each repository refresh has a 15-second budget across all read-only queries. Loading and failed requests never appear as zero. Failed requests show `unavailable` with an error instead of retaining an outdated count.

An empty `REPOS` value shows `No repositories in REPOS`. Invalid entries show configuration errors. Neither case falls back to local Git changes. Relaunch Pi with `REPOS` unset to restore local Git mode. Changes to the environment inside Pi take effect after `/reload`.

## Git discovery

This mode applies only when `REPOS` is unset. No forge API requests run in this mode.

Git's native worktree list is refreshed for the checkout containing Pi's cwd and for every discovered independent repository below it. This includes sibling and nested-repository worktrees outside the current directory tree. Dirty worktrees are always shown. The checkout containing Pi's cwd remains visible when clean; other clean worktrees are hidden unless their Git status changed while the current Pi conversation was open, after which they remain visible as clean for that conversation. This memory is stored in the Pi session, survives `/reload`, and follows the active `/tree` branch. A clean worktree that was merely present at startup or opened by another process remains hidden.

Below the current checkout, directories containing their own `.git` directory become independent repository groups. Their primary checkouts and linked worktrees follow the same dirty and conversation-memory rules. Linked-worktree container rows are filtered from the status of the repository that owns them instead of appearing as untracked directories.

Files are grouped under their checkout or repository, and long paths are shortened from the left so the filename remains readable. If the current checkout is clean and no other worktree or nested repository qualifies, the Git section shows its header and one compact `clean` row. When the terminal is too short, the sidebar reports how many rows remain undisplayed.

Git worktree membership and Git state refresh every 15 seconds and after relevant Pi events. `/sidebar refresh` also forces independent-repository rediscovery.

## Fullscreen trial checks

The restored package passed its adjacent tests on Pi 1.4.0. Terminal checks covered scrolling, width changes, on/off, narrow-window hiding, reload, and the `/git` overlay. Fullscreen checks also loaded the user's existing extensions.

One scrolling capture showed a briefly blank sidebar before repainting. Fullscreen does not eliminate redraw flicker. Mouse selection, inline images, and a real external editor were not tested.

The dashboard redesign also passed layout checks at widths 20, 40, 53, and 80, including Unicode text and unknown context usage. Real Pi checks covered reload, width changes, narrow-window hiding, and restoration. Populated and empty fixtures were inspected in xterm with dark and light themes.

Session-card checks covered virtual-model replay, the selected and routed thinking levels, quota placement, reload, and narrow-window hiding. They used synthetic responses and quota statuses without model requests. Dark and light screenshots are under `/tmp/pi-sidebar-session-card-proof/`.

The compact two-bar layout passed adjacent tests and real Pi reload, width, hiding, and restoration checks. Dark and light screenshots were inspected. Synthetic fixtures and terminal captures are under `/tmp/pi-sidebar-simple-bars-proof/`. No live model request was needed.

Original trial captures are under `/tmp/pi-sidebar-proof/`. Dashboard captures and screenshots are under `/tmp/pi-sidebar-dashboard-proof/`. These files are temporary. The compact layout retains the same fullscreen risks.

## Compatibility and troubleshooting

Pi currently has no public API for either a non-overlapping persistent side column or Codex account quota. This extension wraps private `tui.doRender` and `terminal.columns` fields and reads the undocumented Codex `/backend-api/wham/usage` endpoint, then restores the TUI fields on reload or shutdown. A future Pi or OpenAI change can break either contract; quota failures degrade to `unavailable`.

If the sidebar disappears after an upgrade:

1. run `/reload` and read the warning notification;
2. verify no other sidebar or custom-footer extension is loaded;
3. run the adjacent test:

   ```bash
   host="$(npm root -g)/@earendil-works/pi-coding-agent"
   export JITI_ALIAS="{\"@earendil-works/pi-coding-agent\":\"$host/dist/index.js\",\"@earendil-works/pi-tui\":\"$host/node_modules/@earendil-works/pi-tui/dist/index.js\"}"
   node "$host/node_modules/jiti/lib/jiti-cli.mjs" extensions/pi-sidebar/pi-sidebar.test.ts
   ```

4. launch the fullscreen trial from source with `pi --tui-mode fullscreen -e /home/djipey/informatique/ai/skills_and_commands/extensions/pi-sidebar`.

The compositor skips painting while Pi's TUI is stopped for an external editor and restores the terminal cursor during disposal. Fullscreen mode may avoid scrollback issues, but raw painting outside Pi's screen model and private TUI hooks remain unsupported.
