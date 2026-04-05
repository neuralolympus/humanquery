import fs from 'node:fs';
import pg from 'pg';
import mysql from 'mysql2/promise';
import sql from 'mssql';
import { DatabaseSync } from 'node:sqlite';
import type { DBConnection, Dialect, QueryResult } from '../types.js';

export async function testConnection(dialect: Dialect, connectionString: string): Promise<void> {
  const conn: DBConnection = {
    id: '_test',
    name: '_test',
    dialect,
    connectionString,
    createdAt: new Date().toISOString(),
  };
  await execute(conn, 'SELECT 1 AS ok');
}

const BANNED = new RegExp(
  String.raw`\b(?:DROP|DELETE|INSERT|UPDATE|TRUNCATE|ALTER|GRANT|REVOKE|EXEC|EXECUTE|XP_)\b`,
  'i',
);

function stripSqlComments(input: string): string {
  let s = input.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/--[^\n]*/g, ' ');
  return s;
}

function takeFirstStatement(sql: string): string {
  let depth = 0;
  let inS = false;
  let inD = false;
  let prev = '';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (!inS && !inD) {
      if (ch === '(') depth++;
      else if (ch === ')' && depth > 0) depth--;
      else if (ch === "'" && prev !== '\\') inS = true;
      else if (ch === '"' && prev !== '\\') inD = true;
      else if (ch === ';' && depth === 0) {
        return sql.slice(0, i).trim();
      }
    } else {
      if (inS && ch === "'" && prev !== '\\') inS = false;
      if (inD && ch === '"' && prev !== '\\') inD = false;
    }
    prev = ch;
  }
  return sql.trim();
}

function firstMeaningfulToken(sql: string): string {
  const s = stripSqlComments(sql).trim();
  const m = s.match(/^([a-zA-Z]+)/);
  return (m?.[1] ?? '').toUpperCase();
}

function hasRowLimit(sql: string, _dialect: Dialect): boolean {
  if (/\bLIMIT\s+\d+/i.test(sql)) return true;
  if (/\bTOP\s*\(\s*\d+\s*\)/i.test(sql)) return true;
  if (/\bTOP\s+\d+/i.test(sql)) return true;
  if (/\bFETCH\s+NEXT\s+\d+/i.test(sql)) return true;
  if (/\bROWNUM\b/i.test(sql)) return true;
  return false;
}

function injectLimit(sql: string, max: number, dialect: Dialect): string {
  if (hasRowLimit(sql, dialect)) return sql;
  switch (dialect) {
    case 'postgresql':
    case 'sqlite':
      return `${sql}\nLIMIT ${max}`;
    case 'mysql':
      return `${sql}\nLIMIT ${max}`;
    case 'mssql': {
      if (/^\s*SELECT\s+(DISTINCT\s+)?/i.test(sql)) {
        return sql.replace(
          /^\s*SELECT\s+(DISTINCT\s+)?/i,
          (_, dist: string | undefined) => `SELECT ${dist ?? ''}TOP (${max}) `,
        );
      }
      return `SELECT TOP (${max}) * FROM (\n${sql}\n) AS _hq_sub`;
    }
    default: {
      const _: never = dialect;
      return _;
    }
  }
}

export function assertSqlSafe(sql: string, dialect: Dialect): string {
  const stmt = takeFirstStatement(sql);
  if (BANNED.test(stmt)) {
    throw new Error('Query contains forbidden keywords');
  }
  const tok = firstMeaningfulToken(stmt);
  if (tok !== 'SELECT' && tok !== 'WITH') {
    throw new Error('Only SELECT / WITH queries are allowed');
  }
  const max = Math.min(10_000, Math.max(1, Number(process.env.MAX_ROWS ?? 1000)));
  return injectLimit(stmt, max, dialect);
}

async function execPostgres(connectionString: string, sqlText: string): Promise<QueryResult> {
  const client = new pg.Client({ connectionString });
  const t0 = performance.now();
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const res = await client.query(sqlText);
    await client.query('COMMIT');
    const columns = res.fields?.map((f) => f.name) ?? [];
    const rows = (res.rows as Record<string, unknown>[]).map((row) => columns.map((c) => row[c]));
    return {
      columns,
      rows,
      rowCount: res.rowCount ?? rows.length,
      execTimeMs: Math.round(performance.now() - t0),
    };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    await client.end();
  }
}

async function execMysql(connectionString: string, sqlText: string): Promise<QueryResult> {
  const c = await mysql.createConnection(connectionString);
  const t0 = performance.now();
  try {
    await c.query('START TRANSACTION READ ONLY');
    const [rows, fields] = await c.query(sqlText);
    await c.query('COMMIT');
    const fieldList = Array.isArray(fields)
      ? (fields as mysql.FieldPacket[]).map((f) => f.name)
      : [];
    const rowArr = rows as Record<string, unknown>[];
    const outRows = rowArr.map((r) => fieldList.map((name) => r[name]));
    return {
      columns: fieldList,
      rows: outRows,
      rowCount: rowArr.length,
      execTimeMs: Math.round(performance.now() - t0),
    };
  } catch (e) {
    try {
      await c.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    await c.end();
  }
}

async function execMssql(connectionString: string, sqlText: string): Promise<QueryResult> {
  let pool: sql.ConnectionPool | undefined;
  const t0 = performance.now();
  try {
    pool = await sql.connect(connectionString);
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.READ_UNCOMMITTED);
    try {
      const request = new sql.Request(tx);
      const res = await request.query(sqlText);
      await tx.commit();
      const recordset = res.recordset as Record<string, unknown>[] | undefined;
      const columns =
        recordset && recordset.length > 0 ? Object.keys(recordset[0] as object) : extractMssqlColumns(res);
      const rows = recordset?.map((r) => columns.map((col) => r[col])) ?? [];
      return {
        columns,
        rows,
        rowCount: rows.length,
        execTimeMs: Math.round(performance.now() - t0),
      };
    } catch (e) {
      try {
        await tx.rollback();
      } catch {
        /* ignore */
      }
      throw e;
    }
  } finally {
    if (pool) await pool.close();
  }
}

function extractMssqlColumns(res: sql.IResult<any>): string[] {
  const cols = (res as { columns?: { name: string }[] }).columns;
  if (cols?.length) return cols.map((c) => c.name);
  return [];
}

function sqlitePathFromConnectionString(cs: string): string {
  const trimmed = cs.trim();
  if (trimmed.startsWith('file:')) {
    return trimmed.slice('file:'.length).split('?')[0] ?? trimmed;
  }
  return trimmed;
}

function execSqlite(connectionString: string, sqlText: string): QueryResult {
  const filePath = sqlitePathFromConnectionString(connectionString);
  if (!fs.existsSync(filePath)) {
    throw new Error(`SQLite database not found: ${filePath}`);
  }
  const db = new DatabaseSync(filePath);
  const t0 = performance.now();
  try {
    const stmt = db.prepare(sqlText);
    const cols = stmt.columns().map((c) => c.name);
    const raw = stmt.all() as Record<string, unknown>[];
    const rows = raw.map((r) => cols.map((c) => r[c]));
    return {
      columns: cols,
      rows,
      rowCount: rows.length,
      execTimeMs: Math.round(performance.now() - t0),
    };
  } finally {
    db.close();
  }
}

export async function execute(connection: DBConnection, sqlText: string): Promise<QueryResult> {
  const safe = assertSqlSafe(sqlText, connection.dialect);
  switch (connection.dialect) {
    case 'postgresql':
      return execPostgres(connection.connectionString, safe);
    case 'mysql':
      return execMysql(connection.connectionString, safe);
    case 'mssql':
      return execMssql(connection.connectionString, safe);
    case 'sqlite':
      return Promise.resolve(execSqlite(connection.connectionString, safe));
    default: {
      const _: never = connection.dialect;
      throw new Error(`Unsupported dialect: ${String(_)}`);
    }
  }
}
