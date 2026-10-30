# Pi voice pass-backed API key plan

## Brief

Add Google Cloud API-key authentication to `pi-voice` without storing the secret in its JSON configuration. The configuration will store a `pass` entry path, and the extension will read the key when it transcribes audio. Existing Application Default Credentials will remain the default.

## Current state / relevant context

- `extensions/pi-voice/gemini.ts` always authenticates with Application Default Credentials.
- The extension calls the standard Vertex AI project and location endpoint.
- Google supports that endpoint with an API key bound to a service account.
- Gemini 3.5 Transcribe is not listed for Vertex AI express mode. Express-mode keys and endpoints are therefore outside this change.
- `~/.pi/agent/pi-voice.json` currently contains only the Google Cloud project.

## Proposed implementation

Add an optional `apiKeyPassPath` configuration field.

When the field is present:

1. Run `pass show <apiKeyPassPath>` without a shell.
2. Use the trimmed first output line as the API key.
3. Send the key in the `x-goog-api-key` header.
4. Do not load Application Default Credentials.

When the field is absent, preserve the current ADC behavior. Read `pass` for each transcription so key rotation works without restarting Pi. Return clear errors for a missing command, failed entry lookup, or empty first line. Never include the key in configuration, status text, or errors.

## File-by-file impact

- `extensions/pi-voice/gemini.ts`
  - Add `apiKeyPassPath` to `VoiceConfig`.
  - Add the small `pass` reader.
  - Select API-key or ADC request headers.
- `extensions/pi-voice/pi-voice.ts`
  - Skip ADC preloading when API-key authentication is configured.
- `extensions/pi-voice/pi-voice.test.ts`
  - Test configuration and `pass` output handling.
- `docs/pi-voice.md`
  - Document both authentication methods, the `pass` requirement, and standard Google Cloud API-key requirements.

## Risks and edge cases

- A normal express-mode or unbound API key might not authorize Gemini 3.5 Transcribe on the standard endpoint.
- `pass` can block while GPG requests a password. The extension will wait and then report failure if the command exits unsuccessfully.
- Password-store entries can contain notes after the secret. Only the first line will be used.
- API-key mode still needs `project` because the extension keeps the standard Vertex AI endpoint.

## Validation / testing

- Run the adjacent Node test file.
- Verify `pass` receives separate `show` and path arguments.
- Verify an empty first line is rejected.
- Verify existing ADC configuration remains valid.
- Run `git diff --check` and `pre-commit run --all-files`.

## Step-by-step execution checklist

- [x] Add and test the `pass` entry reader.
- [x] Add API-key request authentication with ADC fallback.
- [x] Update recording startup to avoid unnecessary ADC loading.
- [x] Document setup and configuration.
- [x] Run focused and repository validation.
- [x] Record completion and any deviations.

## Completion notes

Implemented the proposed `apiKeyPassPath` flow without deviations. A dedicated key was provisioned, stored in `pass`, and equality-verified against its infrastructure output. The live Pi configuration uses a pass entry and shortcut `ctrl+space`. The extension invokes `pass` directly, uses only the first output line, and keeps ADC as the fallback. Focused tests, `git diff --check`, and `pre-commit run --all-files` passed. Live transcription remains untested.
