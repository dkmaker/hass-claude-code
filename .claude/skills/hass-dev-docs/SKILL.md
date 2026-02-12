---
name: hass-dev-docs
description: "Home Assistant developer documentation. Use when the user asks about Home Assistant integrations, add-ons, architecture, APIs, entities, config flows, or any HA development topic. Also use when explicitly asked to update or search HA developer docs."
argument-hint: "[update [user|developer|both]|index [user|developer|both]|search <query> [in user|developer]|stats|stop]"
allowed-tools: Bash(python *), Bash(npx tsx *), Bash(curl *), Bash(cat .hass-docs-port), Bash(kill *), Task(hass-docs-search)
---

# Home Assistant Developer Docs

This skill manages a local mirror of the Home Assistant developer documentation and provides search access via an embedded search service with semantic (vector) and keyword (FTS5) search.

The docs live at: `docs/hass-developer/` (relative to the project root).

## Search Service

The search service runs as a background HTTP process. Before any search or index operation, ensure it's running:

```bash
# Check if service is running
if ! curl -s http://localhost:$(cat .hass-docs-port 2>/dev/null)/health > /dev/null 2>&1; then
  # Start the service in the background
  nohup npx tsx .claude/skills/hass-dev-docs/service/src/server.ts > /tmp/hass-docs-search.log 2>&1 &
  # Wait for port file to appear (up to 30 seconds)
  for i in $(seq 1 30); do
    if [ -f .hass-docs-port ] && curl -s http://localhost:$(cat .hass-docs-port)/health > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi
```

The service auto-indexes docs on startup and writes its port to `.hass-docs-port`.

## Commands

### `/hass-dev-docs update [user|developer|both]`

Update the local docs mirror from upstream GitHub repositories.

**For developer docs** (default if no argument):
```bash
python .claude/skills/hass-dev-docs/scripts/update-docs.py docs/hass-developer
curl -X POST "http://localhost:$(cat .hass-docs-port)/index?doc_set=hass-developer"
```

**For user docs**:
```bash
python .claude/skills/hass-dev-docs/scripts/update-user-docs.py docs/hass-user
curl -X POST "http://localhost:$(cat .hass-docs-port)/index?doc_set=hass-user"
```

**For both**:
```bash
python .claude/skills/hass-dev-docs/scripts/update-docs.py docs/hass-developer
python .claude/skills/hass-dev-docs/scripts/update-user-docs.py docs/hass-user
curl -X POST "http://localhost:$(cat .hass-docs-port)/index?doc_set=hass-developer"
curl -X POST "http://localhost:$(cat .hass-docs-port)/index?doc_set=hass-user"
```

Each script will:
1. Clone the latest docs from GitHub
2. Strip YAML frontmatter (extracting only the title)
3. Remove MDX components and raw HTML
4. Remove Docusaurus admonition markers (keeping content)
5. Generate a `CLAUDE.md` index
6. Generate `CHANGELOG.md` with diff summary
7. Deploy the clean versions

Report the result to the user — summarize what changed based on the script output.

### `/hass-dev-docs index [user|developer|both]`

Trigger a re-index of the documentation. Ensure the service is running first (see above).

**For developer docs** (default):
```bash
curl -X POST "http://localhost:$(cat .hass-docs-port)/index?doc_set=hass-developer"
```

**For user docs**:
```bash
curl -X POST "http://localhost:$(cat .hass-docs-port)/index?doc_set=hass-user"
```

**For both**:
```bash
curl -X POST "http://localhost:$(cat .hass-docs-port)/index?doc_set=hass-developer"
curl -X POST "http://localhost:$(cat .hass-docs-port)/index?doc_set=hass-user"
```

Check progress with:
```bash
curl -s "http://localhost:$(cat .hass-docs-port)/stats"
```

### `/hass-dev-docs search <query> [in user|developer]`

Search the HA documentation for a specific topic.

**Default behavior**: Searches **both** user and developer docs simultaneously.

**Optional filtering**:
- `in user` - Search only user-facing documentation
- `in developer` - Search only developer documentation

**Always follow this workflow**:

1. **Start the service if needed** (run the auto-start check from "Search Service" section above)
2. **Delegate to the subagent**:
   ```
   Use Task tool with:
   - subagent_type: hass-docs-search
   - prompt: Search for "<user's query>" [in user docs|in developer docs|in both user and developer docs]. The search service is running on port $(cat .hass-docs-port).
   ```

The subagent will:
- Use semantic search for natural language queries
- Fall back to keyword search for specific terms
- Read relevant files for full context
- Return a comprehensive summary with file references and doc type (user/developer)

**Examples**:
- `/hass-dev-docs search config flow` - Searches both user and developer docs
- `/hass-dev-docs search config flow in developer` - Developer docs only
- `/hass-dev-docs search automation in user` - User docs only

### `/hass-dev-docs stats`

Show search service statistics:

```bash
curl -s "http://localhost:$(cat .hass-docs-port)/stats" | python3 -m json.tool
```

Displays:
- Total files indexed
- Total chunks (by ## heading sections)
- Total inter-document links
- Indexing status
- Embedding model readiness

### `/hass-dev-docs stop`

Stop the search service:

```bash
kill $(cat .hass-docs-pid)
```

The service will clean up port and PID files automatically.

### `/hass-dev-docs` (no arguments)

When invoked without arguments, check if `docs/hass-developer/CLAUDE.md` exists:
- If it exists, read it and use it as context for answering HA development questions
- If it doesn't exist, tell the user to run `/hass-dev-docs update` first

## Answering HA Questions

When this skill is loaded to answer a question (not via explicit `/` command):

1. **Start the service if needed**:
   ```bash
   if ! curl -s http://localhost:$(cat .hass-docs-port 2>/dev/null)/health > /dev/null 2>&1; then
     nohup npx tsx .claude/skills/hass-dev-docs/service/src/server.ts > /tmp/hass-docs-search.log 2>&1 &
     for i in $(seq 1 30); do
       if [ -f .hass-docs-port ] && curl -s http://localhost:$(cat .hass-docs-port)/health > /dev/null 2>&1; then
         break
       fi
       sleep 1
     done
   fi
   ```

2. **Delegate to `hass-docs-search`**:
   ```
   Use Task tool with subagent_type: hass-docs-search
   Prompt: Search for relevant documentation about "<user's question>"
   ```

3. **Provide the answer** using the search results with specific file references

**Important**: The subagent has access to semantic (vector) and keyword (FTS5) search. It will automatically:
- Search with natural language understanding
- Read relevant files for context
- Return comprehensive summaries with code examples

## Setup (First Time Only)

Before using the search service, install dependencies:

```bash
cd .claude/skills/hass-dev-docs/service && npm install
```

This installs:
- Express (HTTP server)
- better-sqlite3 + sqlite-vec (database with vector search)
- @huggingface/transformers (embedding model)
- Supporting packages

The service will auto-download the embedding model (~85MB) on first run and cache it in `service/data/models/`.

## Important Notes

- The docs are plain markdown files — no build step needed
- The `CLAUDE.md` index has a one-line description per file for quick navigation
- Always delegate searches to `hass-docs-search` to avoid bloating main context
- The update script handles everything via a staging directory — safe to re-run
- Service data (DB, models, logs) is gitignored automatically
