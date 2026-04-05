import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Dialect } from '../types.js';

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

function deriveKey(secret: string): Buffer {
  // Always 32 bytes for AES-256-GCM regardless of ENCRYPTION_KEY length
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function encrypt(plain: string, secret: string): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: enc, iv, tag };
}

function decrypt(ciphertext: Buffer, iv: Buffer, tag: Buffer, secret: string): string {
  const key = deriveKey(secret);
  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

let dbInstance: DatabaseSync | null = null;

export function getLocalDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const dir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'humanquery.local.sqlite');
  dbInstance = new DatabaseSync(file);
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dialect TEXT NOT NULL,
      ciphertext BLOB NOT NULL,
      iv BLOB NOT NULL,
      tag BLOB NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      nl_query TEXT NOT NULL,
      raw_sql TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      exec_ms INTEGER NOT NULL,
      output_type TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_history_conn ON history(connection_id, created_at DESC);
  `);
  return dbInstance;
}

export interface ConnectionRecord {
  id: string;
  name: string;
  dialect: Dialect;
  createdAt: string;
}

export function listConnections(): ConnectionRecord[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `SELECT id, name, dialect, created_at AS createdAt FROM connections ORDER BY datetime(created_at) DESC`,
    )
    .all() as unknown as ConnectionRecord[];
  return rows;
}

export function getConnectionById(id: string): ConnectionRecord | undefined {
  const db = getLocalDb();
  return db
    .prepare(`SELECT id, name, dialect, created_at AS createdAt FROM connections WHERE id = ?`)
    .get(id) as ConnectionRecord | undefined;
}

export function saveConnection(
  id: string,
  name: string,
  dialect: Dialect,
  connectionString: string,
  encryptionKey: string,
): void {
  const db = getLocalDb();
  const { ciphertext, iv, tag } = encrypt(connectionString, encryptionKey);
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO connections (id, name, dialect, ciphertext, iv, tag, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, dialect, ciphertext, iv, tag, createdAt);
}

export function deleteConnection(id: string): boolean {
  const db = getLocalDb();
  const r = db.prepare(`DELETE FROM connections WHERE id = ?`).run(id);
  return r.changes > 0;
}

export function getDecryptedConnectionString(id: string, encryptionKey: string): string | undefined {
  const db = getLocalDb();
  const row = db
    .prepare(`SELECT ciphertext, iv, tag FROM connections WHERE id = ?`)
    .get(id) as { ciphertext: Buffer | Uint8Array; iv: Buffer | Uint8Array; tag: Buffer | Uint8Array } | undefined;
  if (!row) return undefined;
  const asBuf = (b: Buffer | Uint8Array) => (Buffer.isBuffer(b) ? b : Buffer.from(b));
  return decrypt(asBuf(row.ciphertext), asBuf(row.iv), asBuf(row.tag), encryptionKey);
}

export function appendHistory(
  id: string,
  connectionId: string,
  nlQuery: string,
  rawSql: string,
  rowCount: number,
  execMs: number,
  outputType: string | undefined,
): void {
  const db = getLocalDb();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO history (id, connection_id, nl_query, raw_sql, row_count, exec_ms, output_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, connectionId, nlQuery, rawSql, rowCount, execMs, outputType ?? null, createdAt);
}

export interface HistoryRow {
  id: string;
  connectionId: string;
  nlQuery: string;
  rawSql: string;
  rowCount: number;
  execMs: number;
  outputType: string | null;
  createdAt: string;
}

export function listHistory(connectionId: string, limit: number): HistoryRow[] {
  const db = getLocalDb();
  return db
    .prepare(
      `SELECT id, connection_id AS connectionId, nl_query AS nlQuery, raw_sql AS rawSql,
              row_count AS rowCount, exec_ms AS execMs, output_type AS outputType, created_at AS createdAt
       FROM history WHERE connection_id = ? ORDER BY datetime(created_at) DESC LIMIT ?`,
    )
    .all(connectionId, limit) as unknown as HistoryRow[];
}
