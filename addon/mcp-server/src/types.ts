// --- Docs search types (adapted from existing service) ---

export interface FileRecord {
  id: number;
  file_path: string;
  doc_set: string;
  content_hash: string;
  title: string | null;
  last_indexed_at: string;
}

export interface Chunk {
  id: number;
  file_id: number;
  section_heading: string | null;
  chunk_text: string;
  position: number;
}

export interface Link {
  id: number;
  source_file: string;
  target_file: string;
  link_text: string | null;
  section: string | null;
}

export interface SearchResult {
  chunk_text: string;
  section_heading: string | null;
  file_path: string;
  title: string | null;
  score: number;
}

export interface IndexStats {
  total_files: number;
  total_chunks: number;
  total_links: number;
  indexing_in_progress: boolean;
  last_indexed_doc_set: string | null;
}

export interface DocSetConfig {
  name: string;
  base_path: string;
}

// --- Home Assistant types ---

export interface HAEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
  context: {
    id: string;
    parent_id: string | null;
    user_id: string | null;
  };
}

export interface HAArea {
  area_id: string;
  name: string;
  aliases: string[];
  picture: string | null;
  floor_id: string | null;
  labels: string[];
}

export interface HADevice {
  id: string;
  name: string | null;
  name_by_user: string | null;
  area_id: string | null;
  manufacturer: string | null;
  model: string | null;
  sw_version: string | null;
  config_entries: string[];
  identifiers: Array<[string, string]>;
  labels: string[];
}

export interface HAConfigEntry {
  entry_id: string;
  domain: string;
  title: string;
  state: string;
  supports_options: boolean;
  supports_remove_device: boolean;
  supports_unload: boolean;
  supports_reconfigure: boolean;
  disabled_by: string | null;
}

export interface HAServiceCallResponse {
  success: boolean;
  context?: {
    id: string;
    parent_id: string | null;
    user_id: string | null;
  };
}
