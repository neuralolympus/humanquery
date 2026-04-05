import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import type { Dialect } from '../types.js';
import {
  deleteConnection,
  getConnectionById,
  listConnections,
  saveConnection,
} from '../db/local.js';
import { testConnection } from '../services/executor.js';
import { dialectLabel } from '../services/introspector.js';

const DIALECTS: Dialect[] = ['postgresql', 'mysql', 'mssql', 'sqlite'];

function isDialect(d: string): d is Dialect {
  return DIALECTS.includes(d as Dialect);
}

export async function registerConnectionRoutes(app: FastifyInstance) {
  const key = () => {
    const k = process.env.ENCRYPTION_KEY;
    if (!k) throw new Error('ENCRYPTION_KEY is not set');
    return k;
  };

  app.get('/api/connections', async () => {
    return listConnections().map((c) => ({
      id: c.id,
      name: c.name,
      dialect: c.dialect,
      dialectLabel: dialectLabel(c.dialect),
      createdAt: c.createdAt,
    }));
  });

  app.post<{
    Body: { dialect: string; connectionString: string };
  }>('/api/connections/test', async (req, reply) => {
    const { dialect, connectionString } = req.body ?? {};
    if (!connectionString || typeof connectionString !== 'string') {
      return reply.code(400).send({ error: 'connectionString required' });
    }
    if (!dialect || !isDialect(dialect)) {
      return reply.code(400).send({ error: 'invalid dialect' });
    }
    try {
      await testConnection(dialect, connectionString);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      return reply.code(400).send({ ok: false, error: msg });
    }
  });

  app.post<{
    Body: { name: string; dialect: string; connectionString: string };
  }>('/api/connections', async (req, reply) => {
    const { name, dialect, connectionString } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      return reply.code(400).send({ error: 'name required' });
    }
    if (!connectionString || typeof connectionString !== 'string') {
      return reply.code(400).send({ error: 'connectionString required' });
    }
    if (!dialect || !isDialect(dialect)) {
      return reply.code(400).send({ error: 'invalid dialect' });
    }
    try {
      await testConnection(dialect, connectionString);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      return reply.code(400).send({ error: msg });
    }
    const id = crypto.randomUUID();
    saveConnection(id, name, dialect, connectionString, key());
    const row = getConnectionById(id)!;
    return {
      id: row.id,
      name: row.name,
      dialect: row.dialect,
      dialectLabel: dialectLabel(row.dialect),
      createdAt: row.createdAt,
    };
  });

  app.delete<{ Params: { id: string } }>('/api/connections/:id', async (req, reply) => {
    const ok = deleteConnection(req.params.id);
    if (!ok) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });
}
