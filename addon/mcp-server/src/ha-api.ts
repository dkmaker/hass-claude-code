import type { HAEntityState, HAServiceCallResponse } from './types.js';

const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || '';
const HA_BASE_URL = 'http://supervisor/core/api';

async function haFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${HA_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${SUPERVISOR_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HA API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function searchEntities(args: {
  query?: string;
  domain?: string;
  area?: string;
  limit?: number;
}): Promise<HAEntityState[]> {
  const states = await haFetch<HAEntityState[]>('/states');

  let filtered = states;

  if (args.domain) {
    filtered = filtered.filter(s => s.entity_id.startsWith(args.domain + '.'));
  }

  if (args.query) {
    const q = args.query.toLowerCase();
    filtered = filtered.filter(s =>
      s.entity_id.toLowerCase().includes(q) ||
      (s.attributes.friendly_name as string || '').toLowerCase().includes(q)
    );
  }

  if (args.area) {
    const a = args.area.toLowerCase();
    filtered = filtered.filter(s => {
      const areaId = s.attributes.area_id as string;
      return areaId && areaId.toLowerCase().includes(a);
    });
  }

  const limit = args.limit || 50;
  return filtered.slice(0, limit);
}

export async function getEntityState(entityId: string): Promise<HAEntityState> {
  return haFetch<HAEntityState>(`/states/${encodeURIComponent(entityId)}`);
}

export async function callService(
  domain: string,
  service: string,
  data?: Record<string, unknown>,
): Promise<HAServiceCallResponse[]> {
  return haFetch<HAServiceCallResponse[]>(`/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
}

export async function searchAutomations(query?: string): Promise<HAEntityState[]> {
  const states = await haFetch<HAEntityState[]>('/states');
  let automations = states.filter(s => s.entity_id.startsWith('automation.'));

  if (query) {
    const q = query.toLowerCase();
    automations = automations.filter(s =>
      s.entity_id.toLowerCase().includes(q) ||
      (s.attributes.friendly_name as string || '').toLowerCase().includes(q)
    );
  }

  return automations;
}

export async function getConfig(): Promise<Record<string, unknown>> {
  return haFetch<Record<string, unknown>>('/config');
}
