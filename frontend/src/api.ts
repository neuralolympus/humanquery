const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export type Dialect = 'postgresql' | 'mysql' | 'mssql' | 'sqlite';

export interface ConnectionListItem {
  id: string;
  name: string;
  dialect: Dialect;
  dialectLabel: string;
  createdAt: string;
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: { table: string; column: string };
}

export interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
}

export interface GeneratedQuery {
  rawSQL: string;
  prisma: string;
  typeorm: string;
  sequelize: string;
  sqlalchemy: string;
  djangoOrm: string;
  explanation: string;
  tablesUsed: string[];
  estimatedRisk: 'safe' | 'moderate' | 'destructive';
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  execTimeMs: number;
}

export type OutputType = 'table' | 'json' | 'csv' | 'count';

export interface QueryResponse {
  generated: GeneratedQuery;
  result: QueryResult;
  formatted: string | null;
}

export interface HistoryItem {
  id: string;
  nlQuery: string;
  rowCount: number;
  execMs: number;
  createdAt: string;
}

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? r.statusText);
  }
  return r.json() as Promise<T>;
}

export async function fetchConnections(): Promise<ConnectionListItem[]> {
  return j(await fetch(`${BASE}/api/connections`));
}

export async function testConnection(body: {
  dialect: Dialect;
  connectionString: string;
}): Promise<void> {
  const r = await fetch(`${BASE}/api/connections/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await j(r);
}

export async function saveConnection(body: {
  name: string;
  dialect: Dialect;
  connectionString: string;
}): Promise<ConnectionListItem> {
  return j(
    await fetch(`${BASE}/api/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteConnection(id: string): Promise<void> {
  await j(await fetch(`${BASE}/api/connections/${id}`, { method: 'DELETE' }));
}

export async function introspect(connectionId: string, forceRefresh?: boolean): Promise<SchemaTable[]> {
  const data = await j<{ schema: SchemaTable[] }>(
    await fetch(`${BASE}/api/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, forceRefresh }),
    }),
  );
  return data.schema;
}

export async function runQuery(body: {
  connectionId: string;
  nlQuery: string;
  outputType: OutputType;
}): Promise<QueryResponse> {
  return j(
    await fetch(`${BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function fetchHistory(connectionId: string, limit = 20): Promise<HistoryItem[]> {
  const q = new URLSearchParams({ connectionId, limit: String(limit) });
  const data = await j<{ items: HistoryItem[] }>(await fetch(`${BASE}/api/history?${q}`));
  return data.items;
}
