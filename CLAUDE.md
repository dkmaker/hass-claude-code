# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This repository provides Claude Code with Home Assistant documentation search capabilities. It contains:

- **Local doc mirrors** of HA user and developer documentation (cleaned markdown)
- **A semantic search service** for querying those docs via vector + keyword search
- **Claude Code skills and agents** that wire everything together

The goal: when working on HA integrations in other repos, Claude Code can search these docs via the `hass-dev-docs` skill or `hass-docs-search` subagent.

## Architecture

```
.claude/
  agents/
    hass-docs-search.md    # Haiku subagent — searches docs via the HTTP service
  skills/
    hass-dev-docs/
      SKILL.md             # Skill definition (update, index, search, stats, stop)
      scripts/             # Python scripts to clone + clean docs from GitHub
      service/             # Node.js search service (Express + SQLite + vector search)
docs/
  hass-developer/          # Cleaned HA developer docs (markdown), auto-generated
  hass-user/               # Cleaned HA user docs (markdown), auto-generated
resources/                 # Cloned upstream repos (gitignored, re-downloadable)
```

### Search service (`service/`)

TypeScript service running on Node.js via tsx. Key modules:

- `server.ts` — Express HTTP server, binds a dynamic port
- `db.ts` — SQLite database init (better-sqlite3 + sqlite-vec extension)
- `indexer.ts` — Reads markdown files, chunks by `##` headings, stores embeddings
- `embeddings.ts` — Loads Xenova/all-MiniLM-L6-v2 via @huggingface/transformers
- `search.ts` — Semantic (vector) and keyword (FTS5) search implementations
- `backlinks.ts` — Inter-document link graph
- `lifecycle.ts` — Port/PID file management, project root detection

### Data flow

1. Python scripts clone docs from GitHub, strip frontmatter/MDX, output clean markdown
2. Search service indexes the markdown into SQLite: chunks table (with embeddings in vec0 virtual table) + FTS5 full-text index
3. The `hass-docs-search` subagent queries the HTTP API and reads files as needed

## Commands

### Search service

```bash
# Install dependencies (first time)
pnpm --dir .claude/skills/hass-dev-docs/service install

# Start service (dynamic port written to .hass-docs-port)
pnpm --dir .claude/skills/hass-dev-docs/service start

# Stop service
kill $(cat .hass-docs-pid)
```

### Update docs

```bash
# Developer docs
python .claude/skills/hass-dev-docs/scripts/update-docs.py docs/hass-developer

# User docs
python .claude/skills/hass-dev-docs/scripts/update-user-docs.py docs/hass-user
```

### Search API (when service is running)

```bash
PORT=$(cat .hass-docs-port)

# Semantic search (supports ?doc_set=hass-user|hass-developer)
curl "http://localhost:$PORT/search?q=config+flow&limit=5"

# Keyword search
curl "http://localhost:$PORT/search/keyword?q=ConfigEntry&limit=5"

# Service stats
curl "http://localhost:$PORT/stats"
```

## Key constraints

- The search service must run under **Node.js** (not Bun) — Transformers.js ONNX runtime has issues with Bun
- sqlite-vec's vec0 virtual table does **not** support bound `?` parameters for primary key columns when using better-sqlite3. Use template literals for PKs, bound params for embeddings only (see `indexer.ts`)
- Package manager is **pnpm**
- The `docs/` directories are auto-generated — edit the update scripts, not the docs directly
- `resources/` is gitignored — it holds cloned upstream repos that can be re-downloaded

## Copilot instructions (from upstream HA docs repo)

When editing content in `resources/home-assistant-io/`, follow the HA writing style:
- American English, Microsoft Style Guide, sentence-style capitalization
- Use "Home Assistant" in full (never "HA" or "HASS")
- Use `**bold**` only for UI strings, `_italics_` for emphasis
- YAML: 2-space indent, `true`/`false` booleans, double-quoted strings, block-style sequences
- Prefer lists over tables (mobile readability)
