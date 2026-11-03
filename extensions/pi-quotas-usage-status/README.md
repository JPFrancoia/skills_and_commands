# pi-quotas-usage-status

This Pi extension shows the remaining quota for the active provider in the footer.

It contains only the footer feature from `@latentminds/pi-quotas`. It does not add quota commands, warnings, token totals, or settings.

## Behavior

The extension refreshes the footer every 60 seconds and after each turn.

For a virtual model, the footer follows the provider that handles the assistant request. A new virtual session shows no quota before the first provider response.

The extension clears old results after a provider change. It also rejects results from an old session or provider.

If `pi-synthetic` provides its own Synthetic footer, this extension hides its duplicate Synthetic status.

## Supported providers

- Anthropic
- OpenAI Codex
- GitHub Copilot
- OpenRouter
- Synthetic
- xAI
- Z.ai
- OpenCode Go
- Kimi Code
- Ollama Cloud

## Install

From the repository root, run:

```bash
pi install "$PWD/extensions/pi-quotas-usage-status"
```

Then reload each open Pi session:

```text
/reload
```

Remove any existing `extensions/pi-quotas` or `npm:@latentminds/pi-quotas` package entry.

## Credentials

The extension uses the credentials that Pi stores in `~/.pi/agent/auth.json`.

OpenCode Go also accepts these environment variables:

- `OPENCODE_GO_WORKSPACE_ID`
- `OPENCODE_GO_AUTH_COOKIE`

Synthetic also accepts `SYNTHETIC_API_KEY`. Ollama Cloud also accepts `OLLAMA_API_KEY`.

The extension does not log or store new credential data.

## Limits

Some providers use private or undocumented quota endpoints. A provider change can make its footer value unavailable.

A direct Anthropic API key has no subscription quota data. The extension hides the footer for that credential type.

## Source license

The provider and footer code comes from `@latentminds/pi-quotas`. The copied code remains under its MIT license.

See [LICENSE](LICENSE).
