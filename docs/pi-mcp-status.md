# MCP status indicator

`extensions/pi-mcp-status/pi-mcp-status.ts` shows `🔌 N` in the Pi footer.

`N` is the number of distinct MCP namespaces that have a registered, non-hidden tool. The indicator can show `🔌 0`.

The extension reads the local registered-tool list every second. It does not make an extra MCP connection.

After a server disconnects, Pi can retain its registered tools. The indicator can then show a stale count. It omits servers that have no registered, non-hidden tools.

## Install

From this repository root, install the local package:

```bash
pi install "$PWD/extensions/pi-mcp-status"
```

Reload each open Pi session:

```text
/reload
```

## Validate

Run the adjacent test with the host `jiti` setup in [Local Pi resources](local-resources.md):

```bash
node "$host/node_modules/jiti/lib/jiti-cli.mjs" extensions/pi-mcp-status/pi-mcp-status.test.ts
```
