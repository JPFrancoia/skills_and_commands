# Fix virtual-model routing in BTW

## Brief

BTW inherits `jev/auto` without the runtime that owns its router. Its child session then reports a missing API key. Preserve routing without changing the main model or expanding child tools.

## Current state / relevant context

- Source: `/home/djipey/informatique/ai/pi-btw`, branch `fix/virtual-model-routing`, based on installed version `v0.8.0`.
- `createBtwModelRuntimeOptions()` copies physical provider registrations and temporary keys into a new runtime.
- Virtual models need their registered route, physical providers, and authentication together.
- The SDK accepts an existing `ModelRuntime`, but `ExtensionContext` exposes only its registry.
- The installed registry stores its runtime in `runtime`, a private TypeScript field.
- Chat and summaries use the same runtime helper. Child tools and conversation state remain separate.

## Proposed implementation

For virtual selections only, pass the parent model runtime to the child through the SDK's existing `modelRuntime` option. Use one guarded compatibility access to the registry's runtime. Report a clear error if that access is unavailable. Keep the physical-provider path unchanged. Do not reload parent extensions or copy their tools.

Use a local checkout rather than editing the npm installation. Replace only the `npm:pi-btw` package entry after validation.

## File-by-file impact

- `extensions/btw.ts`: preserve the owning runtime for virtual models.
- `tests/btw.runtime.test.ts`: cover inherited selections, overrides, summaries, and a missing runtime accessor.
- `tests/btw.sdk.test.ts`: exercise routing with the real SDK and a local fake provider.
- Existing package documentation: explain inherited virtual models and the compatibility limit.
- `/home/djipey/.pi/agent/settings.json`: select the tested local package without duplicate loading.

## Risks and edge cases

- The SDK can change its private registry field. Guard access and explain the failure instead of silently changing models.
- Runtime services are shared, but child messages, tools, routing state, and lifecycle remain session-owned.
- Router callbacks retain their existing extension context. Extension-owned side effects can therefore remain parent-owned.
- Preserve support for older SDKs and physical providers.
- Do not change read-only or tool-free capability boundaries.

## Validation / testing

Success means virtual BTW prompts reach the routed physical provider without a `jev` key. Follow-ups, read-only mode, and summaries must preserve their existing capabilities. Parent history must remain unchanged.

Run a failing regression before editing. Run the complete tests and typecheck against the locked SDK and installed Pi version. Check the minimum supported SDK when practical. Run the real command path with a local fake provider. Test Jev with a short live prompt if current credentials permit it. Inspect package discovery after activation.

## Step-by-step execution checklist

1. [x] Locate source, inspect APIs, and reproduce the missing registration.
2. [x] Add a failing virtual-model regression.
3. [x] Implement the guarded runtime handoff.
4. [x] Run tests and real command-path checks.
5. [x] Update affected documentation.
6. [x] Activate the local checkout and verify package discovery.

## Completion record

Completed on 2026-10-19.

- Locked Pi 0.99.2: all 183 tests and typecheck passed.
- Installed Pi 1.3.0: all 182 tests present during that check and typecheck passed.
- Minimum Pi 0.85.1: 177 tests passed, six feature-dependent tests skipped, and typecheck passed.
- The final added tool-continuation test passed on the locked SDK.
- The actual Jev router returned `BTW_ROUTER_OK` through `/btw:ask` on the installed SDK.
- Package discovery resolves the sole BTW entry to this checkout. The settings symlink remains unchanged.
- The interactive overlay was not checked. No commit, push, or release was made.

## Open questions / assumptions

- The request authorizes a local fix and switching the installed package to that checkout.
- No push, pull request, release, or commit is requested.
- The private accessor is a temporary compatibility bridge, not a new public SDK contract.
