import fs from 'node:fs';
import pg from 'pg';
import mysql from 'mysql2/promise';
import sql from 'mssql';
import { DatabaseSync } from 'node:sqlite';
import type { DBConnection, Dialect, SchemaTable } from '../types.js';

const cache = new Map<string, { schema: SchemaTable[]; expiresAt: number }>();

function getTtlMs(): number {
  const s = Number(process.env.SCHEMA_CACHE_TTL_SECONDS ?? 300);
  return Math.max(0, s) * 1000;
}

export function serializeSchemaAsDDL(tables: SchemaTable[]): string {
  const lines: string[] = [];
  for (const t of tables) {
    const colDefs = t.columns.map((c) => {
      let s = `  ${quoteIdent(c.name)} ${c.type}`;
      if (!c.nullable) s += ' NOT NULL';
      if (c.isPrimaryKey) s += ' PRIMARY KEY';
      if (c.isForeignKey && c.references) {
        s += ` /* FK -> ${c.references.table}.${c.references.column} */`;
      }
      return s;
    });
    lines.push(`CREATE TABLE ${quoteIdent(t.name)} (\n${colDefs.join(',\n')}\n);`);
  }
  return lines.join('\n\n');
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function introspect(
  connection: DBConnection,
  options?: { forceRefresh?: boolean },
): Promise<SchemaTable[]> {
  const ttl = getTtlMs();
  const now = Date.now();
  const hit = cache.get(connection.id);
  if (!options?.forceRefresh && hit && hit.expiresAt > now) {
    return hit.schema;
  }

  let schema: SchemaTable[];
  switch (connection.dialect) {
    case 'postgresql':
      schema = await introspectPostgres(connection.connectionString);
      break;
    case 'mysql':
      schema = await introspectMysql(connection.connectionString);
      break;
    case 'mssql':
      schema = await introspectMssql(connection.connectionString);
      break;
    case 'sqlite':
      schema = introspectSqlite(connection.connectionString);
      break;
    default: {
      const x: never = connection.dialect;
      throw new Error(`Unsupported dialect: ${x}`);
    }
  }

  if (ttl > 0) {
    cache.set(connection.id, { schema, expiresAt: now + ttl });
  }
  return schema;
}

export function invalidateSchemaCache(connectionId: string): void {
  cache.delete(connectionId);
}

async function introspectPostgres(connectionString: string): Promise<SchemaTable[]> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const { rows: cols } = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(`
      SELECT c.table_name, c.column_name, c.data_type, c.is_nullable
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      ORDER BY c.table_name, c.ordinal_position
    `);

    const { rows: pkRows } = await client.query<{ table_name: string; column_name: string }>(`
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
    `);
    const pk = new Set(pkRows.map((r) => `${r.table_name}.${r.column_name}`));

    const { rows: fkRows } = await client.query<{
      table_name: string;
      column_name: string;
      foreign_table_name: string;
      foreign_column_name: string;
    }>(`
      SELECT
        kcu.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    `);
    const fkMap = new Map<string, { table: string; column: string }>();
    for (const r of fkRows) {
      fkMap.set(`${r.table_name}.${r.column_name}`, {
        table: r.foreign_table_name,
        column: r.foreign_column_name,
      });
    }

    return buildTablesFromColumns(cols, pk, fkMap, (r) => ({
      table: r.table_name,
      column: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable === 'YES',
    }));
  } finally {
    await client.end();
  }
}

async function introspectMysql(connectionString: string): Promise<SchemaTable[]> {
  const c = await mysql.createConnection(connectionString);
  try {
    const [colsRaw] = await c.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    );
    const cols = colsRaw as {
      TABLE_NAME: string;
      COLUMN_NAME: string;
      DATA_TYPE: string;
      IS_NULLABLE: string;
      COLUMN_KEY: string;
    }[];

    const [keysRaw] = await c.query(
      `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );
    const keys = keysRaw as {
      TABLE_NAME: string;
      COLUMN_NAME: string;
      REFERENCED_TABLE_NAME: string;
      REFERENCED_COLUMN_NAME: string;
    }[];
    const fkMap = new Map<string, { table: string; column: string }>();
    for (const r of keys) {
      fkMap.set(`${r.TABLE_NAME}.${r.COLUMN_NAME}`, {
        table: r.REFERENCED_TABLE_NAME,
        column: r.REFERENCED_COLUMN_NAME,
      });
    }

    const pk = new Set<string>();
    for (const col of cols) {
      if (col.COLUMN_KEY === 'PRI') {
        pk.add(`${col.TABLE_NAME}.${col.COLUMN_NAME}`);
      }
    }

    return buildTablesFromColumns(cols, pk, fkMap, (r) => ({
      table: r.TABLE_NAME,
      column: r.COLUMN_NAME,
      type: r.DATA_TYPE,
      nullable: r.IS_NULLABLE === 'YES',
    }));
  } finally {
    await c.end();
  }
}

async function introspectMssql(connectionString: string): Promise<SchemaTable[]> {
  const pool = await sql.connect(connectionString);
  try {
    const result = await pool.request().query<{
      schema_name: string;
      table_name: string;
      column_name: string;
      type_name: string;
      is_nullable: number;
      is_pk: number;
    }>(`
      SELECT s.name AS schema_name, t.name AS table_name, c.name AS column_name,
             ty.name AS type_name, c.is_nullable,
             CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_pk
      FROM sys.tables t
      JOIN sys.schemas s ON t.schema_id = s.schema_id
      JOIN sys.columns c ON c.object_id = t.object_id
      JOIN sys.types ty ON c.user_type_id = ty.user_type_id
      LEFT JOIN (
        SELECT ic.object_id, ic.column_id
        FROM sys.indexes i
        JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        WHERE i.is_primary_key = 1
      ) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
      ORDER BY s.name, t.name, c.column_id
    `);

    const fkResult = await pool.request().query<{
      parent_table: string;
      parent_column: string;
      ref_table: string;
      ref_column: string;
    }>(`
      SELECT OBJECT_NAME(f.parent_object_id) AS parent_table,
             pc.name AS parent_column,
             OBJECT_NAME(f.referenced_object_id) AS ref_table,
             rc.name AS ref_column
      FROM sys.foreign_keys f
      JOIN sys.foreign_key_columns fc ON f.object_id = fc.constraint_object_id
      JOIN sys.columns pc ON pc.object_id = fc.parent_object_id AND pc.column_id = fc.parent_column_id
      JOIN sys.columns rc ON rc.object_id = fc.referenced_object_id AND rc.column_id = fc.referenced_column_id
    `);
    const fkMap = new Map<string, { table: string; column: string }>();
    for (const r of fkResult.recordset) {
      fkMap.set(`${r.parent_table}.${r.parent_column}`, { table: r.ref_table, column: r.ref_column });
    }

    type MsCol = {
      schema_name: string;
      table_name: string;
      column_name: string;
      type_name: string;
      is_nullable: number;
      is_pk: number;
    };
    const colRows = result.recordset as MsCol[];

    const pk = new Set<string>();
    for (const r of colRows) {
      if (r.is_pk) pk.add(`${r.table_name}.${r.column_name}`);
    }

    return buildTablesFromColumns(colRows, pk, fkMap, (r) => ({
      table: r.table_name,
      column: r.column_name,
      type: r.type_name,
      nullable: Boolean(r.is_nullable),
    }));
  } finally {
    await pool.close();
  }
}

function sqlitePathFromConnectionString(cs: string): string {
  const trimmed = cs.trim();
  if (trimmed.startsWith('file:')) {
    return trimmed.slice('file:'.length).split('?')[0] ?? trimmed;
  }
  return trimmed;
}

function introspectSqlite(connectionString: string): SchemaTable[] {
  const filePath = sqlitePathFromConnectionString(connectionString);
  if (!fs.existsSync(filePath)) {
    throw new Error(`SQLite database not found: ${filePath}`);
  }
  const db = new DatabaseSync(filePath);
  try {
    const tableRows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all() as { name: string }[];
    const userTables = tableRows.map((r) => ({ name: r.name, type: 'table' as const }));
    const tables: SchemaTable[] = [];

    for (const { name: tableName } of userTables) {
      const infos = db.prepare(`PRAGMA table_info(${quoteSqliteIdent(tableName)})`).all() as {
        cid: number;
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];
      const fks = db.prepare(`PRAGMA foreign_key_list(${quoteSqliteIdent(tableName)})`).all() as {
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
      }[];
      const fkByCol = new Map<string, { table: string; column: string }>();
      for (const fk of fks) {
        fkByCol.set(fk.from, { table: fk.table, column: fk.to });
      }

      tables.push({
        name: tableName,
        columns: infos.map((info) => {
          const ref = fkByCol.get(info.name);
          const isFk = Boolean(ref);
          return {
            name: info.name,
            type: info.type || 'ANY',
            nullable: info.notnull === 0,
            isPrimaryKey: info.pk > 0,
            isForeignKey: isFk,
            references: ref,
          };
        }),
      });
    }
    return tables;
  } finally {
    db.close();
  }
}

function quoteSqliteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function buildTablesFromColumns<T>(
  rows: T[],
  pk: Set<string>,
  fkMap: Map<string, { table: string; column: string }>,
  map: (r: T) => { table: string; column: string; type: string; nullable: boolean },
): SchemaTable[] {
  const byTable = new Map<string, SchemaTable>();
  for (const r of rows) {
    const m = map(r);
    let t = byTable.get(m.table);
    if (!t) {
      t = { name: m.table, columns: [] };
      byTable.set(m.table, t);
    }
    const key = `${m.table}.${m.column}`;
    const ref = fkMap.get(key);
    t.columns.push({
      name: m.column,
      type: m.type,
      nullable: m.nullable,
      isPrimaryKey: pk.has(key),
      isForeignKey: Boolean(ref),
      references: ref,
    });
  }
  return [...byTable.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function dialectLabel(d: Dialect): string {
  switch (d) {
    case 'postgresql':
      return 'PostgreSQL';
    case 'mysql':
      return 'MySQL';
    case 'mssql':
      return 'MS SQL Server';
    case 'sqlite':
      return 'SQLite';
    default: {
      const _: never = d;
      return _;
    }
  }
}
