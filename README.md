# AI4SE Coding Agent Harness

A transparent, auditable, mock-testable coding agent harness. Implements the equation **Agent = LLM + Harness** — the LLM decides what to do next, the harness handles everything else: tool execution, guardrails, feedback loops, memory, and configuration.

## Architecture

- **8-state explicit state machine**: IDLE → THINKING → GUARDING → EXECUTING/WAITING_APPROVAL → OBSERVING → FEEDBACK → DONE
- **Feedback Engine** (deep dimension): Parser → Classifier → Injector pipeline for deterministic test/lint feedback
- **Guardrails**: Deterministic command/path checking with HITL approval for dangerous operations
- **Mock-testable**: Every mechanism is a pure function testable without a real LLM

## Quick Start

### Prerequisites
- Node.js >= 20
- macOS (for Keychain) or Linux (fallback encrypted file)

### Install
```bash
git clone <repo-url>
cd ai4se-harness
npm install
npm run build
```

### Configure API Key
```bash
npm run dev setup
# Enter your Anthropic API key when prompted (hidden input)
# Key is stored in macOS Keychain — never in files or git
```

### Run
```bash
# CLI mode
npm run dev run "fix the multiply function"

# Web UI mode
npm run dev serve
# Open http://localhost:3000
```

### Test
```bash
npm test
# All tests use mock LLM — no network or API key required
```

## Security — Credential Storage

API keys are NEVER stored in:
- Source code or config files
- Git history
- Logs or terminal output
- Environment variables

**macOS**: Stored in Keychain via `security` CLI
**Linux/Other**: AES-256-GCM encrypted file at `~/.harness/` (requires user-defined master password in production)

### Key Management
```bash
npm run dev setup              # Store key (hidden input)
npm run dev config -- --show-key-status  # Check if key exists (masked display)
npm run dev config -- --clear-key        # Remove key
```

## Distribution — Docker

```bash
docker build -t ai4se-harness .
docker run -p 3000:3000 -v $(pwd):/workspace ai4se-harness
```

**Known limitation**: Docker containers cannot access macOS Keychain. Use the `harness setup` command inside the container to configure a key (stored as encrypted file inside the container).

## Project Structure

```
src/
  core/           # State machine, context builder, LLM provider
  guardrails/     # Command & path safety checking
  feedback/       # Parser, classifier, injector pipeline
  tools/          # File read/write, shell, test, lint executor
  memory/         # Project memory store
  credentials/    # Keychain integration
  config/         # Configuration loader
  cli/            # CLI entry point (parseArgs, main)
  server/         # Express + Socket.IO + xterm.js Web UI
  types.ts        # Shared TypeScript types
tests/            # Vitest tests (all mock-LLM based)
```

## Testing Philosophy

Every harness mechanism is a deterministic TypeScript function:
- **Guardrails**: `isDangerous("rm -rf /", patterns)` → `{ dangerous: true }` — no LLM needed
- **Feedback**: `parseTestOutput(json)` → `FeedbackItem[]` — pure parser
- **State Machine**: `engine.run(task)` with `createMockProvider([...])` → deterministic state transitions

62 tests, 13 test files, all pass without network or API key.

## CI/CD

GitHub Actions runs `npm test` + `npm run build` on every push. Docker image built after tests pass. GitLab CI (`.gitlab-ci.yml`) mirrors the same `unit-test` job.

## Known Limitations

- **Platform**: credential storage uses macOS Keychain; Linux and Docker fall back to an AES-256-GCM encrypted file (requires a user-defined master password in production).
- **Runtime**: Node.js >= 20.
- **Docker**: containers cannot access the host macOS Keychain — run `harness setup` inside the container to store a key as an encrypted file.
- **Web UI**: xterm.js / Socket.IO load from a CDN (`cdn.jsdelivr.net`), so the browser needs internet access (a proxy may be required in mainland China).
- **Registry**: the published image lives at `ghcr.io/myfmyl/ai4se-harness` (not Docker Hub) due to the build environment's network constraints.

## License

MIT
