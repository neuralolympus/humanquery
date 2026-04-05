import type { FastifyInstance } from 'fastify';
import { getConnectionById, getDecryptedConnectionString } from '../db/local.js';
import type { DBConnection } from '../types.js';
import { introspect } from '../services/introspector.js';

export async function registerIntrospectRoutes(app: FastifyInstance) {
  app.post<{
    Body: { connectionId?: string; forceRefresh?: boolean };
  }>('/api/introspect', async (req, reply) => {
    const { connectionId, forceRefresh } = req.body ?? {};
    if (!connectionId) {
      return reply.code(400).send({ error: 'connectionId required' });
    }
    const row = getConnectionById(connectionId);
    if (!row) return reply.code(404).send({ error: 'connection not found' });
    const k = process.env.ENCRYPTION_KEY;
    if (!k) return reply.code(500).send({ error: 'server misconfigured' });
    const cs = getDecryptedConnectionString(connectionId, k);
    if (!cs) return reply.code(404).send({ error: 'connection not found' });

    const connection: DBConnection = {
      id: row.id,
      name: row.name,
      dialect: row.dialect,
      connectionString: cs,
      createdAt: row.createdAt,
    };

    try {
      const schema = await introspect(connection, { forceRefresh: Boolean(forceRefresh) });
      return { schema };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Introspection failed';
      return reply.code(502).send({ error: msg });
    }
  });
}
