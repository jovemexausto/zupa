# English Buddy (Workspace App)

`english-buddy` is the main development app for this monorepo.
It consumes `voxpal` from the local workspace (`workspace:*`).

## Run Locally

From repository root:

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs the app locally (no Docker required) and auto-builds `voxpal` first.
The SQLite parent directory is created automatically, so first startup no longer fails with libsql code 14.

## Optional LiteLLM Sidecar (Local App + Docker Sidecar)

From repository root:

```bash
pnpm litellm:up
pnpm dev
```

Stop sidecar:

```bash
pnpm litellm:down
```

Docker sidecar runs with an isolated WhatsApp auth profile path (`./.wwebjs_auth_docker`) to avoid Chromium profile-lock collisions with local `pnpm dev` sessions.

## Environment Variables

Set variables in your shell/session before running (no tracked `.env` file flow):

- `LLM_BASE_URL` (default local app: `http://localhost:4000`; when using sidecar/stack use `http://litellm:4000`)
- `LLM_API_KEY` (default: `no-key`)
- `LLM_MODEL` (default: `gpt-4o-mini`)
- `STT_PROVIDER` (`whisper_api` | `whisper_local` | `deepgram`, default `whisper_api`)
- `STT_API_KEY` (defaults to `LLM_API_KEY`)
- `TTS_PROVIDER` (`openai` | `elevenlabs` | `coqui`, default `openai`)
- `TTS_API_KEY` (defaults to `LLM_API_KEY`)
- `TTS_VOICE` (default: `alloy`)
- `VOXPAL_DB_URL` (default: `sqlite:///./data/voxpal.db`)
- `SINGLE_USER` (optional)
- `WWEBJS_BROWSER_PATH` (optional)

## Docker

Full stack from repository root:

```bash
pnpm dev:stack
```

Equivalent command from `examples/english-buddy`:

```bash
docker compose up --build
```

For live development inside container:

```bash
docker compose -f docker-compose.dev.yml up --build
```
