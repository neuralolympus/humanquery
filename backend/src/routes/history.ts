import type { FastifyInstance } from 'fastify';
import { getConnectionById, listHistory } from '../db/local.js';

export async function registerHistoryRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { connectionId?: string; limit?: string };
  }>('/api/history', async (req, reply) => {
    const { connectionId, limit } = req.query;
    if (!connectionId) {
      return reply.code(400).send({ error: 'connectionId required' });
    }
    if (!getConnectionById(connectionId)) {
      return reply.code(404).send({ error: 'connection not found' });
    }
    const lim = Math.min(100, Math.max(1, Number(limit ?? 20)));
    const items = listHistory(connectionId, lim);
    return {
      items: items.map((h) => ({
        id: h.id,
        nlQuery: h.nlQuery,
        rowCount: h.rowCount,
        execMs: h.execMs,
        createdAt: h.createdAt,
      })),
    };
  });
}
