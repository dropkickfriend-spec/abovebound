const CLIENT_ID_KEY = 'abovebound.anonymous-workspace.v1';

export interface AnonymousComputationRecord {
  id: string;
  type: string;
  category?: string;
  version?: string;
  summary?: string;
  stats?: unknown;
  state?: unknown;
  timestamp: number;
}

export interface AnonymousWorkspaceSnapshot {
  mode: 'anonymous_first_party';
  createdAt: number;
  updatedAt: number;
  recordCount: number;
  records: AnonymousComputationRecord[];
  savedVersions: string[];
  sharedLearningRecords: number;
}

let cachedClientId = '';

export function getAnonymousClientId(): string {
  if (cachedClientId) return cachedClientId;

  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY);
    if (existing && /^ab_[a-zA-Z0-9_-]{12,80}$/.test(existing)) {
      cachedClientId = existing;
      return existing;
    }

    const randomPart = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('');
    cachedClientId = `ab_${randomPart}`;
    window.localStorage.setItem(CLIENT_ID_KEY, cachedClientId);
    return cachedClientId;
  } catch {
    cachedClientId = `ab_${crypto.randomUUID().replaceAll('-', '')}`;
    return cachedClientId;
  }
}

export function memoryFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('X-AboveBound-Workspace', getAnonymousClientId());
  return fetch(input, { ...init, headers });
}

export async function loadAnonymousWorkspace(): Promise<AnonymousWorkspaceSnapshot> {
  const response = await memoryFetch('/api/workspace');
  if (!response.ok) throw new Error(`Workspace memory returned ${response.status}.`);
  return response.json();
}

export async function recordAnonymousComputation(record: Omit<AnonymousComputationRecord, 'id' | 'timestamp'>) {
  const response = await memoryFetch('/api/workspace/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (!response.ok) throw new Error(`Workspace checkpoint returned ${response.status}.`);
  return response.json();
}
