# Custom Pi sidebar

`extensions/pi-sidebar/` is an opt-in trial of a fixed right sidebar that replaces Pi's footer. Pi's transcript and editor reflow into the remaining width, so sidebar content does not cover them. Fullscreen rendering is experimental. The extension wraps private TUI rendering and terminal-width fields, so it may break mouse selection, overlays, or future Pi upgrades. There is no proof that it fixes earlier display problems.

## Try it

Start a new Pi session in fullscreen mode and load the package from source:

```bash
pi --tui-mode fullscreen -e /home/djipey/informatique/ai/skills_and_commands/extensions/pi-sidebar
```

This is an opt-in trial; it does not install the package globally or change settings. Relaunch Pi without `-e` to remove the trial completely. `/sidebar off` hides the sidebar, but the extension still owns the footer and suppresses the `rpiv-todo` widget. Do not load it together with `pi-sidebar-tui`, `@esso0428/pi-sidebar`, another custom footer, or another extension that reserves terminal columns.

## Displayed data

- conversation name, with the first user message as fallback;
- model, thinking level, cwd, context use, conversation compaction count, turns, and cost;
- a weekly Codex headroom bar and reset countdown when Codex is active and account usage is available;
- running foreground `subagent` tool children and detached async children from the active session;
- `rpiv-todo` tasks from the active session branch;
- footer indicators from other extensions, including Ponytail;
- Git changes in the current checkout, dirty worktrees from that repository and discovered independent nested repositories, and dirty independent repositories below it.

The native footer and `rpiv-todo`'s above-editor widget are hidden because their data is shown in the sidebar.

## Dashboard layout

The sidebar uses Pi's active theme, with side padding and compact section dividers.

- A framed session card shows the title and working directory. Long titles wrap onto two lines before truncation.
- Model, provider, and thinking level appear above a full-width context meter. Token counts sit below the meter.
- Turns, cost, and compactions share a metric row. Narrow sidebars stack these values.
- Subagents and tasks appear when present. When both are empty, one Activity row says `No tasks or agents yet`.
- Extension statuses show their existing keys as labels. Long status text wraps beneath each label.

The Git section shows repository names, branches, changed-file counts, and file details. Short terminals limit section content and can omit sections entirely.

## Subagents

The **Subagents** section follows the session metrics. Each agent has a name line and a second line with status, cumulative runtime, and cost.

This includes foreground calls, detached runs, and nested descendants that pi-subagents reports. Entries remain after a child stops and survive reload, compaction, and `/tree` navigation within that branch. A green dot and `Running` mean at least one invocation is running. A red dot and `Stopped` mean none are running.

Runtime and cost combine the agent's invocations (`1m46s · $0.4660`). Parallel child durations are summed. Pending top-level children are not listed, and totals do not carry across Pi sessions. The section refreshes every second. It stays hidden until an agent appears.

Async metrics use pi-subagents' validated run status. The sidebar accepts lifecycle versions 2 and 3, plus the unversioned workflow status from pi-subagents 0.45. Running state also uses event-bus RPC `data.fleet` version 1 as an ephemeral zero-metric fallback. A `subagent` call that omits `async` runs in the background with pi-subagents 0.41. Missing or invalid status data leaves recorded rows and totals intact. Use `/subagents-fleet` for detailed run inspection and controls.

## Weekly Codex quota

The weekly Codex meter shows the overall account percentage remaining, not usage attributed to the current conversation. Its percentage appears above the meter. A separate line shows `Resets in Xd`, or `Resets in Xh` below one day. Session metrics follow beneath it.

The extension resolves the current Codex OAuth token through Pi and queries OpenAI's account-usage endpoint. It refreshes at session start, after completed agent runs, on Codex model selection, and on `/sidebar refresh`. Tokens and responses remain in memory and are never logged or persisted. Pending requests show `Loading account quota…`. Authentication, request, or response failures show `Account quota unavailable`.

## Commands

```text
/sidebar                 Toggle the sidebar
/sidebar on              Show it
/sidebar off             Hide it
/sidebar width 50        Set width for this process (20–80)
/sidebar refresh         Refresh Codex quota, Git data, and repository discovery
/sidebar status          Show current state, width, and repository count
```

The default width is 53 columns. With the 70-column minimum for Pi and a one-column separator, the terminal needs at least 124 columns to show the default-width sidebar. It automatically hides when showing it would leave fewer than 70 columns for Pi.

## Git discovery

Git's native worktree list is refreshed for the checkout containing Pi's cwd and for every discovered independent repository below it. This includes sibling and nested-repository worktrees outside the current directory tree. Dirty worktrees are always shown. The checkout containing Pi's cwd remains visible when clean; other clean worktrees are hidden unless their Git status changed while the current Pi conversation was open, after which they remain visible as clean for that conversation. This memory is stored in the Pi session, survives `/reload`, and follows the active `/tree` branch. A clean worktree that was merely present at startup or opened by another process remains hidden.

Below the current checkout, directories containing their own `.git` directory become independent repository groups. Their primary checkouts and linked worktrees follow the same dirty and conversation-memory rules. Linked-worktree container rows are filtered from the status of the repository that owns them instead of appearing as untracked directories.

Files are grouped under their checkout or repository, and long paths are shortened from the left so the filename remains readable. If the current checkout is clean and no other worktree or nested repository qualifies, the Git section shows its header and one compact `clean` row. When the terminal is too short, the sidebar reports how many rows remain undisplayed.

Git worktree membership and Git state refresh every 15 seconds and after relevant Pi events. `/sidebar refresh` also forces independent-repository rediscovery.

## Fullscreen trial checks

The restored package passed its adjacent tests on Pi 1.4.0. Terminal checks covered scrolling, width changes, on/off, narrow-window hiding, reload, and the `/git` overlay. Fullscreen checks also loaded the user's existing extensions.

One scrolling capture showed a briefly blank sidebar before repainting. Fullscreen does not eliminate redraw flicker. Mouse selection, inline images, and a real external editor were not tested.

The dashboard redesign also passed layout checks at widths 20, 40, 53, and 80, including Unicode text and unknown context usage. Real Pi checks covered reload, width changes, narrow-window hiding, and restoration. Populated and empty fixtures were inspected in xterm with dark and light themes.

Original trial captures are under `/tmp/pi-sidebar-proof/`. Dashboard captures and screenshots are under `/tmp/pi-sidebar-dashboard-proof/`. These files are temporary. The redesign changes presentation only and retains the same fullscreen risks.

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
