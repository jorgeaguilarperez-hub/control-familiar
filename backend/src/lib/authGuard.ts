import type { FastifyRequest, FastifyReply } from 'fastify';
import { verificarSesion, COOKIE, type SesionPayload } from './jwt.js';
import { marcarActividad, buscarMiembroPorId, sesionSigueActiva } from './db.js';

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

  // Cierre de sesión por inactividad: si no hubo ninguna interacción real
  // (ver POST /api/auth/actividad) en los últimos segundos, se trata como
  // si la sesión ya no existiera, aunque la cookie siga siendo válida por
  // dentro -- se borra para que el navegador no siga reintentando con ella.
  if (!sesionSigueActiva(sesion.miembroId)) {
    reply.clearCookie(COOKIE.name, { path: '/' });
    reply.code(401).send({ error: 'Tu sesión se cerró por inactividad' });
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
