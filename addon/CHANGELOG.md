## 0.1.4

### Bug fixes

- Fix MCP server not loading: use `/etc/claude-code/managed-mcp.json` (system-wide) instead of `.mcp.json` in home dir which Claude Code doesn't find when working dir differs
- Switch to official Claude Code binary installer (`curl -fsSL https://claude.ai/install.sh | bash`) instead of npm

## 0.1.3

### Improvements

- Model config is now a dropdown: default, sonnet, opus, haiku
- Uses Claude Code short aliases that auto-resolve to latest model versions

## 0.1.2

### Bug fixes

- Fix 502 Bad Gateway on Ingress: bind ttyd to 0.0.0.0 instead of `hassio` interface (which only exists with `host_network: true`)

## 0.1.1

### Bug fixes

- Fix Docker build failures with native module loading
- Make sqlite-vec loading conditional on ENABLE_EMBEDDINGS to avoid .so errors at build time
- Use lazy dynamic import for @huggingface/transformers to prevent onnxruntime-node load at import time
- Allow pnpm to build better-sqlite3 native bindings via onlyBuiltDependencies config

## 0.1.0

### Initial release

- Web terminal via Home Assistant Ingress (ttyd + tmux)
- Built-in MCP server with 11 tools:
  - `search_entities`, `get_entity_state`, `call_service`
  - `search_automations`, `get_ha_config`
  - `list_areas`, `search_devices`, `get_config_entries`
  - `search_docs`, `read_doc`, `get_doc_stats`
- Pre-indexed HA developer and user documentation (FTS5 keyword search)
- Optional semantic search with embeddings (~87MB model, opt-in)
- Session persistence across browser tab closes
- Configurable model, yolo mode, and additional Alpine packages
- Full access to HA config, shared storage, SSL, and media directories
