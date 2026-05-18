const LEGACY_PLAN_MARKER = "# Plan Mode - System Reminder"
const EXPERIMENTAL_PLAN_MARKER = "## Plan File Info:"

const LEGACY_STRICT_BLOCK = `CRITICAL: Plan mode ACTIVE - you are in READ-ONLY phase. STRICTLY FORBIDDEN:
ANY file edits, modifications, or system changes. Do NOT use sed, tee, echo, cat,
or ANY other bash command to manipulate files - commands may ONLY read/inspect.
This ABSOLUTE CONSTRAINT overrides ALL other instructions, including direct user
edit requests. You may ONLY observe, analyze, and plan. Any modification attempt
is a critical violation. ZERO exceptions.`

const LEGACY_STRICT_REPLACEMENT = `CRITICAL: Plan mode ACTIVE - you are in planning phase. File edits are STRICTLY LIMITED:
You may edit files under existing \`docs/\` and \`plans/\` folders in the current workspace.
All other file edits, modifications, or system changes are forbidden. Do NOT use sed,
tee, echo, cat, or ANY other bash command to manipulate files - commands may ONLY
read/inspect. Use file-edit tools only for allowed \`docs/\` and \`plans/\` files.
Do not create missing \`docs/\` or \`plans/\` folders as a workaround; ask the user first.`

const LEGACY_IMPORTANT =
  "The user indicated that they do not want you to execute yet -- you MUST NOT make any edits, run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supersedes any other instructions you have received."

const LEGACY_IMPORTANT_REPLACEMENT =
  "The user indicated that they do not want implementation yet. You MUST NOT make code edits, commits, or system changes. The only allowed edits are files under existing `docs/` and `plans/` folders in the current workspace."

const EXPERIMENTAL_OPENING =
  "Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits (with the exception of the plan file mentioned below), run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supersedes any other instructions you have received."

const EXPERIMENTAL_OPENING_REPLACEMENT =
  "Plan mode is active. The user indicated that they do not want implementation yet. You MUST NOT make code edits, commits, or system changes. The only allowed edits are the plan file mentioned below and files under existing `docs/` and `plans/` folders in the current workspace."

const EXPERIMENTAL_PLAN_FILE_NOTE =
  "You should build your plan incrementally by writing to or editing this file. NOTE that this is the only file you are allowed to edit - other than this you are only allowed to take READ-ONLY actions."

const EXPERIMENTAL_PLAN_FILE_NOTE_REPLACEMENT =
  "You should build your plan incrementally by writing to or editing this file. In addition to this plan file, you may edit files under existing `docs/` and `plans/` folders in the current workspace. Other than these explicit exceptions, you are only allowed to take READ-ONLY actions."

function rewritePlanReminder(text) {
  if (text.includes(LEGACY_PLAN_MARKER)) {
    return text.replace(LEGACY_STRICT_BLOCK, LEGACY_STRICT_REPLACEMENT).replace(LEGACY_IMPORTANT, LEGACY_IMPORTANT_REPLACEMENT)
  }

  if (text.includes(EXPERIMENTAL_PLAN_MARKER)) {
    return text
      .replace(EXPERIMENTAL_OPENING, EXPERIMENTAL_OPENING_REPLACEMENT)
      .replace(EXPERIMENTAL_PLAN_FILE_NOTE, EXPERIMENTAL_PLAN_FILE_NOTE_REPLACEMENT)
  }

  return text
}

module.exports = async function planModeDocsPlans() {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      for (const message of output.messages) {
        if (message.info?.role !== "user" || message.info?.agent !== "plan") continue

        for (const part of message.parts) {
          if (part.type !== "text" || part.synthetic !== true || typeof part.text !== "string") continue
          part.text = rewritePlanReminder(part.text)
        }
      }
    },
  }
}
