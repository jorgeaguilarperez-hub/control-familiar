import type { FastifyInstance } from 'fastify';
import { requireAuth, requireAdmin } from '../lib/authGuard.js';
import { listarPresupuestosDePeriodo, asignarPresupuesto } from '../lib/db.js';
import { periodoActual } from '../lib/presupuestos.js';

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
      const periodo = req.body.periodo || periodoActual();
      return asignarPresupuesto(miembroId, periodo, monto);
    }
  );
}
