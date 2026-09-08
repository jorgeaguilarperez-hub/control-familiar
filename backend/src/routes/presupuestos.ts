import type { FastifyInstance } from 'fastify';
import { requireAuth, requireAdmin } from '../lib/authGuard.js';
import { listarPresupuestosDePeriodo, asignarPresupuesto, buscarMiembroPorId } from '../lib/db.js';
import { periodoActual } from '../lib/presupuestos.js';
import { bitacora } from '../lib/bitacora.js';

const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export default async function presupuestosRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { periodo?: string } }>('/api/presupuestos', { preHandler: requireAuth }, async (req) => {
    const periodo = req.query.periodo || periodoActual();
    return listarPresupuestosDePeriodo(periodo);
  });

  app.put<{ Body: { miembroId: string; periodo?: string; monto: number } }>(
    '/api/presupuestos',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { miembroId, monto } = req.body || ({} as any);
      if (!miembroId || typeof monto !== 'number' || monto < 0) {
        return reply.code(400).send({ error: 'Datos de presupuesto inválidos' });
      }
      const miembro = buscarMiembroPorId(miembroId);
      if (!miembro) return reply.code(404).send({ error: 'Miembro no encontrado' });
      // El administrador es un rol solo para administrar el sistema: no
      // participa del presupuesto familiar.
      if (miembro.rol === 'admin') {
        return reply.code(400).send({ error: 'El administrador no tiene presupuesto asignado' });
      }
      // Un miembro normal puede quedar marcado a mano como "sin
      // presupuesto" (ver editarMiembro) -- mientras esté así, tampoco se le
      // puede asignar uno desde aquí.
      if (miembro.sinPresupuesto) {
        return reply.code(400).send({ error: 'Este miembro está marcado como "sin presupuesto"' });
      }
      const periodo = req.body.periodo || periodoActual();
      const presupuesto = asignarPresupuesto(miembroId, periodo, monto);
      bitacora(req, {
        miembroId: req.miembro!.miembroId,
        nombreActor: req.miembro!.nombre,
        tipo: 'presupuesto_asignado',
        categoria: 'operacion',
        descripcion: `${req.miembro!.nombre} asignó ${formatoMoneda.format(monto)} de presupuesto a ${miembro.nombre} para ${periodo}`,
      });
      return presupuesto;
    }
  );
}
