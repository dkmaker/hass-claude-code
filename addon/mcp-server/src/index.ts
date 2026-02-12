import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { initDb } from './db.js';
import { warmup as warmupEmbeddings } from './embeddings.js';
import { searchEntities, getEntityState, callService, searchAutomations, getConfig } from './ha-api.js';
import { listAreas, searchDevices, getConfigEntries } from './ha-websocket.js';
import { searchDocs, readDoc, getDocStats } from './docs-search.js';

const server = new McpServer({
  name: 'home-assistant',
  version: '1.0.0',
});

// --- HA REST API Tools ---

server.tool(
  'search_entities',
  'Search Home Assistant entities by name, domain, or area',
  {
    query: z.string().optional().describe('Search term to match against entity_id or friendly_name'),
    domain: z.string().optional().describe('Filter by domain (e.g. light, switch, sensor)'),
    area: z.string().optional().describe('Filter by area name'),
    limit: z.number().optional().describe('Max results (default 50)'),
  },
  async (args) => {
    const results = await searchEntities(args);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(results, null, 2),
      }],
    };
  },
);

server.tool(
  'get_entity_state',
  'Get the current state and attributes of a specific entity',
  {
    entity_id: z.string().describe('Entity ID (e.g. light.living_room)'),
  },
  async (args) => {
    const state = await getEntityState(args.entity_id);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(state, null, 2),
      }],
    };
  },
);

server.tool(
  'call_service',
  'Call a Home Assistant service (e.g. turn on a light, trigger an automation)',
  {
    domain: z.string().describe('Service domain (e.g. light, switch, automation)'),
    service: z.string().describe('Service name (e.g. turn_on, turn_off, toggle)'),
    data: z.record(z.unknown()).optional().describe('Service data (e.g. { entity_id: "light.kitchen", brightness: 255 })'),
  },
  async (args) => {
    const result = await callService(args.domain, args.service, args.data);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

server.tool(
  'search_automations',
  'Search automation entities by name',
  {
    query: z.string().optional().describe('Search term to filter automations'),
  },
  async (args) => {
    const results = await searchAutomations(args.query);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(results, null, 2),
      }],
    };
  },
);

server.tool(
  'get_ha_config',
  'Get Home Assistant core configuration',
  {},
  async () => {
    const config = await getConfig();
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(config, null, 2),
      }],
    };
  },
);

// --- HA WebSocket API Tools ---

server.tool(
  'list_areas',
  'List all areas defined in Home Assistant',
  {},
  async () => {
    const areas = await listAreas();
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(areas, null, 2),
      }],
    };
  },
);

server.tool(
  'search_devices',
  'Search devices registered in Home Assistant',
  {
    query: z.string().optional().describe('Search term to match against device name, manufacturer, or model'),
  },
  async (args) => {
    const devices = await searchDevices(args.query);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(devices, null, 2),
      }],
    };
  },
);

server.tool(
  'get_config_entries',
  'List all integration config entries',
  {},
  async () => {
    const entries = await getConfigEntries();
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(entries, null, 2),
      }],
    };
  },
);

// --- Documentation Tools ---

server.tool(
  'search_docs',
  'Search Home Assistant documentation (developer and user docs)',
  {
    query: z.string().describe('Search query'),
    doc_set: z.enum(['hass-developer', 'hass-user']).optional().describe('Filter by doc set'),
    limit: z.number().optional().describe('Max results (default 10)'),
    mode: z.enum(['semantic', 'keyword', 'auto']).optional().describe('Search mode (default auto: tries semantic, falls back to keyword)'),
  },
  async (args) => {
    const results = await searchDocs(args);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(results, null, 2),
      }],
    };
  },
);

server.tool(
  'read_doc',
  'Read the full content of a specific documentation file',
  {
    file_path: z.string().describe('Relative path to the doc file (e.g. creating_integration_manifest.md)'),
    doc_set: z.enum(['hass-developer', 'hass-user']).optional().describe('Which doc set to look in'),
  },
  async (args) => {
    const content = await readDoc(args);
    return {
      content: [{
        type: 'text' as const,
        text: content,
      }],
    };
  },
);

server.tool(
  'get_doc_stats',
  'Get statistics about the indexed documentation',
  {},
  async () => {
    const stats = getDocStats();
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(stats, null, 2),
      }],
    };
  },
);

// --- Startup ---

async function main() {
  console.error('Initializing Home Assistant MCP server...');

  initDb();

  // Warm up embeddings model if enabled (non-blocking)
  warmupEmbeddings().catch(err => {
    console.error('Embedding warmup failed (keyword search still available):', err);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP server connected via stdio.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
