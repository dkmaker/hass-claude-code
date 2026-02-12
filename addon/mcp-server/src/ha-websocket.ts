import type { HAArea, HADevice, HAConfigEntry } from './types.js';

const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || '';
const WS_BASE_URL = 'http://supervisor/core/api';

// The Supervisor proxy supports REST-style websocket command forwarding via the API.
// We use the REST websocket command API to avoid maintaining a persistent WS connection.
async function wsCommand<T>(type: string, extraFields: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${WS_BASE_URL}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPERVISOR_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type, ...extraFields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HA WS command ${type} failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function listAreas(): Promise<HAArea[]> {
  // Use the Supervisor's Core websocket command proxy
  // The area registry is available through template rendering or ws commands
  try {
    return await wsCommand<HAArea[]>('config/area_registry/list');
  } catch {
    // Fallback: return empty if ws commands aren't available through REST
    console.error('Warning: Could not fetch areas via ws command, area listing unavailable');
    return [];
  }
}

export async function searchDevices(query?: string): Promise<HADevice[]> {
  try {
    const devices = await wsCommand<HADevice[]>('config/device_registry/list');
    if (!query) return devices;

    const q = query.toLowerCase();
    return devices.filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.name_by_user || '').toLowerCase().includes(q) ||
      (d.manufacturer || '').toLowerCase().includes(q) ||
      (d.model || '').toLowerCase().includes(q)
    );
  } catch {
    console.error('Warning: Could not fetch devices via ws command');
    return [];
  }
}

export async function getConfigEntries(): Promise<HAConfigEntry[]> {
  try {
    return await wsCommand<HAConfigEntry[]>('config_entries/get');
  } catch {
    console.error('Warning: Could not fetch config entries via ws command');
    return [];
  }
}
