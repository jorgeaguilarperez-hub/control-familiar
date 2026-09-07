import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import authRoutes from './routes/auth.js';
import casasRoutes from './routes/casas.js';
import categoriasRoutes from './routes/categorias.js';
import miembrosRoutes from './routes/miembros.js';
import presupuestosRoutes from './routes/presupuestos.js';
import gastosRoutes from './routes/gastos.js';
import reportesRoutes from './routes/reportes.js';
import { sembrarCategoriasIniciales } from './lib/seedData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ORIGINS = (process.env.ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim());

// Cuando se construye para producción, el frontend vive compilado en
// frontend/dist. Si no existe, no se sirve estático (caso normal en
// desarrollo local, donde el frontend corre con su propio `npm run dev`).
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist');

export async function buildApp(opciones: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opciones.logger ?? true,
    // Render pone la app detrás de un balanceador: sin esto, req.ip
    // siempre sería la IP interna del balanceador.
    trustProxy: true,
  });

  // Fastify/cors por defecto sólo refleja GET,HEAD,POST en el preflight.
  // Sin esto, el navegador bloquea PATCH/DELETE antes de que lleguen a la
  // ruta (falla como "Failed to fetch", sin ningún log del lado del
  // servidor) -- por ejemplo, el botón "Dar de baja" de casas/categorías.
  await app.register(cors, {
    origin: ORIGINS,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  await app.register(authRoutes);
  await app.register(casasRoutes);
  await app.register(categoriasRoutes);
  await app.register(miembrosRoutes);
  await app.register(presupuestosRoutes);
  await app.register(gastosRoutes);
  await app.register(reportesRoutes);

  app.get('/api/salud', async () => ({ ok: true, hora: new Date().toISOString() }));

  for (const mensaje of sembrarCategoriasIniciales()) {
    app.log.info(`[semilla] ${mensaje}`);
  }

  if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
    await app.register(fastifyStatic, { root: FRONTEND_DIST });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'No encontrado' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
