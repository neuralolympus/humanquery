import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerConnectionRoutes } from './routes/connections.js';
import { registerHistoryRoutes } from './routes/history.js';
import { registerIntrospectRoutes } from './routes/introspect.js';
import { registerQueryRoutes } from './routes/query.js';

const port = Number(process.env.PORT ?? 3001);

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? true,
  });

  await registerConnectionRoutes(app);
  await registerIntrospectRoutes(app);
  await registerQueryRoutes(app);
  await registerHistoryRoutes(app);

  app.get('/api/health', async () => ({ ok: true }));

  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
