# Pi voice

`extensions/pi-voice/pi-voice.ts` adds voice dictation to Pi with [Gemini 3.5 Transcribe](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-transcribe) on Vertex AI.

Press a shortcut, talk, and the transcript goes into the Pi editor. A small spectrum meter shows above the editor while you record.

The recording meter and key layout come from [`@earendil-works/pi-voice`](https://github.com/earendil-works/pi-voice), which uses local models. This extension sends the audio to Vertex AI instead.

## Usage

| Key | Action |
|---|---|
| `Ctrl+Space` | Start recording |
| `Space` or `Ctrl+Space` | Stop recording and transcribe |
| `Escape` while recording | Discard the recording |
| `Escape` while transcribing | Cancel the transcription |

`/voice` does the same as the shortcut.

## Requirements

- A Google Cloud project with the Vertex AI API enabled.
- Application Default Credentials (ADC), or a service-account-bound Google Cloud API key stored in `pass`.
- Run `gcloud auth application-default login` once to use ADC.
- Microphone access for your terminal app. On macOS, check System Settings → Privacy & Security → Microphone.

## Install

From this repository root, install the dependencies:

```bash
npm install --legacy-peer-deps --prefix extensions/pi-voice
```

The `--legacy-peer-deps` flag stops npm from copying Pi itself into `node_modules`.

Install the local package:

```bash
pi install "$PWD/extensions/pi-voice"
```

Restart Pi. Pi binds the shortcut when it starts.

## Configuration

Settings live in `~/.pi/agent/pi-voice.json`. Every field is optional.

```json
{
  "project": "my-project",
  "apiKeyPassPath": "gcp/pi-voice",
  "location": "global",
  "languageCodes": ["en-GB"],
  "mode": "SMART",
  "customVocabulary": ["Kubernetes", "BigQuery"],
  "shortcut": "ctrl+space"
}
```

| Field | Default | Meaning |
|---|---|---|
| `project` | `GOOGLE_CLOUD_PROJECT` | Google Cloud project that pays for the requests. |
| `apiKeyPassPath` | none | Optional `pass` entry path for a standard Google Cloud API key bound to a service account. When set, Pi runs `pass show <path>` and uses the first line as the key. Otherwise, Pi uses ADC. |
| `location` | `global` | Vertex location: `global`, `us`, or `eu`. Use `eu` or `us` to keep processing in that region. |
| `languageCodes` | automatic | BCP-47 codes. A language code makes the custom vocabulary more reliable. |
| `mode` | `SMART` | `SMART` removes filler words and applies spoken corrections. `VERBATIM` keeps every word. |
| `customVocabulary` | none | Names and jargon to recognise. The model accepts up to 1,000 terms. It works best with fewer than 100. |
| `shortcut` | `ctrl+space` | Pi key id for the shortcut. Restart Pi after you change it. |

Pi reads the file each time you start a recording. Changes to everything except `shortcut` apply at once.

Gemini 3.5 Transcribe requires a standard Google Cloud API key bound to a service account. An express-mode API key does not work. You can use `apiKeyPassPath` for this key, or use ADC instead.

## Limits

- The model accepts up to 15 minutes of audio. Vertex AI limits the request size, so very long recordings can fail.
- Transcription costs about $0.005 per minute of audio.
- Pi needs a network connection to transcribe.

## Validate

Run the adjacent test:

```bash
node --test extensions/pi-voice/pi-voice.test.ts
```

Run the repository checks:

```bash
git diff --check
pre-commit run --all-files
```
