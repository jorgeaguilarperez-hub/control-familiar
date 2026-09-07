import type { FastifyRequest, FastifyReply } from 'fastify';
import { verificarSesion, COOKIE, type SesionPayload } from './jwt.js';
import { marcarActividad, buscarMiembroPorId } from './db.js';

declare module 'fastify' {
  interface FastifyRequest {
    miembro?: SesionPayload;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies?.[COOKIE.name];
  const sesion = token ? verificarSesion(token) : null;
  if (!sesion) {
    reply.code(401).send({ error: 'No autenticado' });
    return;
  }
  const actual = buscarMiembroPorId(sesion.miembroId);
  if (!actual || !actual.activo) {
    reply.code(401).send({ error: 'No autenticado' });
    return;
  }
  req.miembro = sesion;
  // Cada petición autenticada cuenta como "sigue aquí" -- así se puede
  // mostrar quién está en el sistema ahora mismo, sin necesitar websockets.
  marcarActividad(sesion.miembroId);
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  if (reply.sent) return;
  if (req.miembro?.rol !== 'admin') {
    reply.code(403).send({ error: 'Solo el administrador puede hacer esto' });
  }
}

export async function identificarSiHaySesion(req: FastifyRequest) {
  const token = req.cookies?.[COOKIE.name];
  const sesion = token ? verificarSesion(token) : null;
  if (sesion) req.miembro = sesion;
}
