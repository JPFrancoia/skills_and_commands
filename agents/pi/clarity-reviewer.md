---
name: clarity-reviewer
description: Jev-only clarity scores for supplied source code and context. Returns JSON, not findings or fixes. The parent must supply code, not a path or summary.
runner:
  type: external-cli
  command: pi-clarity-score
  promptDelivery: stdin
async: true
systemPromptMode: replace
inheritProjectContext: false
inheritGlobalContext: false
inheritSkills: false
defaultContext: fresh
---
