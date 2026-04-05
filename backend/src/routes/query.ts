import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import {
  appendHistory,
  getConnectionById,
  getDecryptedConnectionString,
} from '../db/local.js';
import type { DBConnection, OutputType } from '../types.js';
import { execute } from '../services/executor.js';
import { format } from '../services/formatter.js';
import { introspect } from '../services/introspector.js';
import { isQueryRejectedError } from '../errors.js';
import { generateQuery } from '../services/llm.js';

const OUTPUTS: OutputType[] = ['table', 'json', 'csv', 'count'];

function isOutputType(o: string): o is OutputType {
  return OUTPUTS.includes(o as OutputType);
}

export async function registerQueryRoutes(app: FastifyInstance) {
  app.post<{
    Body: { connectionId?: string; nlQuery?: string; outputType?: string };
  }>('/api/query', async (req, reply) => {
    const { connectionId, nlQuery, outputType } = req.body ?? {};
    if (!connectionId) {
      return reply.code(400).send({ error: 'connectionId required' });
    }
    if (!nlQuery || typeof nlQuery !== 'string' || !nlQuery.trim()) {
      return reply.code(400).send({ error: 'nlQuery required' });
    }
    const ot: OutputType = outputType && isOutputType(outputType) ? outputType : 'table';

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

    let schema;
    try {
      schema = await introspect(connection);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Introspection failed';
      return reply.code(502).send({ error: msg });
    }

    let generated;
    try {
      generated = await generateQuery(schema, nlQuery.trim(), connection.dialect);
    } catch (e) {
      if (isQueryRejectedError(e)) {
        return reply.code(422).send({ error: e.message, code: e.code });
      }
      const msg = e instanceof Error ? e.message : 'LLM generation failed';
      return reply.code(502).send({ error: msg });
    }

    let result;
    try {
      result = await execute(connection, generated.rawSQL);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Execution failed';
      return reply.code(400).send({ error: msg, generated });
    }

    const formatted = format(result, ot);

    appendHistory(
      crypto.randomUUID(),
      connectionId,
      nlQuery.trim(),
      generated.rawSQL,
      result.rowCount,
      result.execTimeMs,
      ot,
    );

    return { generated, result, formatted };
  });
}
