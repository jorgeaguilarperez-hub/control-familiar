// Envoltura delgada sobre registrarBitacora (en db.ts) que se encarga de
// sacar la IP y el dispositivo (user-agent) del request -- así cada punto
// de la aplicación que anota algo en la bitácora no tiene que repetir esa
// misma extracción.
import type { FastifyRequest } from 'fastify';
import { registrarBitacora, type TipoBitacora, type CategoriaBitacora } from './db.js';

export function infoDeAcceso(req: FastifyRequest) {
  return {
    ip: req.ip || null,
    userAgent: (req.headers['user-agent'] as string | undefined) || null,
  };
}

export function bitacora(
  req: FastifyRequest,
  datos: {
    miembroId?: string | null;
    nombreActor: string;
    tipo: TipoBitacora;
    categoria: CategoriaBitacora;
    descripcion: string;
  }
) {
  registrarBitacora({ ...datos, ...infoDeAcceso(req) });
}
