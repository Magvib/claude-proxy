# claude-proxy

A lightweight Bun proxy server that makes [Ollama](https://ollama.com) models accessible via a **Claude-compatible (OpenAI-style) API**. It intercepts requests targeting Claude model names and transparently reroutes them to configurable alternative models hosted on Ollama.

## What It Does

If you have tools or clients hardcoded to call Claude models (e.g. `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`), this proxy lets you swap in any Ollama-hosted model without changing the client code.

### Features

- **Model Name Translation**: Automatically rewrites Claude model IDs to your chosen Ollama alternatives.
- **Dynamic Model Listing**: Exposes all Ollama models as `claude-opus-:*` entries via the `/v1/models` endpoint.
- **Web Search Proxy**: Forwards web search queries to Ollama's native search endpoint.
- **Catch-All Proxy**: Every other request is forwarded to `https://ollama.com/` with your auth token.
- **Hot Reload Dev Mode**: Edit and see changes instantly with `bun --hot`.
- **Single Binary Compilation**: Compile to a standalone executable with `bun build --compile`.

## Installation

Requires [Bun](https://bun.sh) ≥ 1.3.

```bash
bun install
```

## Configuration

Create a `.env` file (see `.env.example`):

```env
OLLAMA_KEY=your-ollama-api-key

# Model mappings — what to substitute for Claude model names
OPUS_ALTERNATIVE=glm-5.1
SONNET_ALTERNATIVE=kimi-k2.6
HEIKU_ALTERNATIVE=deepseek-v4-flash

LOGGING=true
PORT=1810
```

| Variable | Purpose |
|----------|---------|
| `OLLAMA_KEY` | Your Ollama API bearer token |
| `OPUS_ALTERNATIVE` | Model to use when client requests `claude-opus-4-7` |
| `SONNET_ALTERNATIVE` | Model to use when client requests `claude-sonnet-4-6` |
| `HEIKU_ALTERNATIVE` | Model to use when client requests `claude-haiku-4-5-20251001` |
| `LOGGING` | If `true`, prints method/path/status for every proxied request |
| `PORT` | Local port the proxy listens on |

## Usage

### Development (with hot reload)

```bash
bun run dev
```

### Production (compiled binary)

```bash
bun run prod
./dist/claude-proxy
```

Or run directly without compiling:

```bash
bun run index.ts
```

## How the Proxying Works

### 1. Fixed Claude → Ollama mappings

Any JSON request body containing:

| Client asks for | Gets rewritten to |
|-----------------|-------------------|
| `claude-opus-4-7` | `glm-5.1` (or your `OPUS_ALTERNATIVE`) |
| `claude-sonnet-4-6` | `kimi-k2.6` (or your `SONNET_ALTERNATIVE`) |
| `claude-haiku-4-5-20251001` | `deepseek-v4-flash` (or your `HEIKU_ALTERNATIVE`) |

Also strips any remaining `"model":"claude-*` or `"model":"opus-*` prefixes.

### 2. Dynamic model listing

`GET /v1/models` fetches all models from Ollama and returns them disguised as `claude-opus-:*` entries, so clients can enumerate available models seamlessly.

### 3. Web search passthrough

`GET /v1/web_search?query=...` forwards the query to Ollama's internal web search API.

### 4. Catch-all

Every other route/method is forwarded directly to `https://ollama.com/{path}` with the same body and headers.

## Example Client Request

Your client thinks it's talking to Claude:

```json
POST http://localhost:1810/v1/chat/completions
Content-Type: application/json

{
  "model": "claude-opus-4-7",
  "messages": [{"role": "user", "content": "Hello!"}]
}
```

The proxy silently rewrites `claude-opus-4-7` → `glm-5.1` and forwards it to Ollama.

## Tech Stack

- [Bun](https://bun.sh) runtime
- `Bun.serve()` with route matching
- No Express, no Vite, no extra framework
