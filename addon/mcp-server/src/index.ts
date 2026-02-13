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
  'Search Home Assistant entities by name, domain, or area. Returns summary list — use get_entity_state for full details.',
  {
    query: z.string().optional().describe('Search term to match against entity_id or friendly_name'),
    domain: z.string().optional().describe('Filter by domain (e.g. light, switch, sensor)'),
    area: z.string().optional().describe('Filter by area name'),
    limit: z.number().optional().describe('Max results (default 50)'),
  },
  async (args) => {
    const results = await searchEntities(args);
    // Return compact summary — use get_entity_state for full attributes
    const summary = results.map(e => ({
      entity_id: e.entity_id,
      state: e.state,
      name: e.attributes.friendly_name || null,
      area: e.attributes.area_id || null,
    }));
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(summary, null, 2),
      }],
    };
  },
);

server.tool(
  'get_entity_state',
  'Get the full state and all attributes of a specific entity',
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
    await callService(args.domain, args.service, args.data);
    return {
      content: [{
        type: 'text' as const,
        text: `Service ${args.domain}.${args.service} called successfully.`,
      }],
    };
  },
);

server.tool(
  'search_automations',
  'Search automation entities by name. Returns summary list.',
  {
    query: z.string().optional().describe('Search term to filter automations'),
  },
  async (args) => {
    const results = await searchAutomations(args.query);
    const summary = results.map(e => ({
      entity_id: e.entity_id,
      state: e.state,
      name: e.attributes.friendly_name || null,
      last_triggered: e.attributes.last_triggered || null,
    }));
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(summary, null, 2),
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
    // Return only useful fields
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          location_name: config.location_name,
          latitude: config.latitude,
          longitude: config.longitude,
          elevation: config.elevation,
          unit_system: config.unit_system,
          time_zone: config.time_zone,
          version: config.version,
          state: config.state,
          components: config.components,
        }, null, 2),
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
    const summary = areas.map(a => ({
      area_id: a.area_id,
      name: a.name,
      floor_id: a.floor_id,
    }));
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(summary, null, 2),
      }],
    };
  },
);

server.tool(
  'search_devices',
  'Search devices registered in Home Assistant. Returns summary list.',
  {
    query: z.string().optional().describe('Search term to match against device name, manufacturer, or model'),
  },
  async (args) => {
    const devices = await searchDevices(args.query);
    const summary = devices.map(d => ({
      id: d.id,
      name: d.name_by_user || d.name,
      area_id: d.area_id,
      manufacturer: d.manufacturer,
      model: d.model,
    }));
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(summary, null, 2),
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
    const summary = entries.map(e => ({
      entry_id: e.entry_id,
      domain: e.domain,
      title: e.title,
      state: e.state,
    }));
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(summary, null, 2),
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
