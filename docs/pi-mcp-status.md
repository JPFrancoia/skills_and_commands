# MCP status indicator

`extensions/pi-mcp-status.ts` shows `🔌 N` in the Pi footer.

`N` is the number of distinct MCP namespaces that have a registered, non-hidden tool. The indicator can show `🔌 0`.

The extension reads the local registered-tool list every second. It does not make an extra MCP connection.

After a server disconnects, Pi can retain its registered tools. The indicator can then show a stale count. It omits servers that have no registered, non-hidden tools.

## Install

From this repository root, create the local extension symlink:

```bash
ln -s "$PWD/extensions/pi-mcp-status.ts" \
  "$HOME/.pi/agent/extensions/pi-mcp-status.ts"
```

Reload each open Pi session:

```text
/reload
```

## Validate

Run the focused test with the installed Pi `jiti` fallback:

```bash
~/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/.bin/jiti \
  extensions/pi-mcp-status.test.ts
```
