import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../lib/authGuard.js';
import { listarGastos, crearGasto, buscarGastoPorId, editarGasto, eliminarGasto } from '../lib/db.js';

export default async function gastosRoutes(app: FastifyInstance) {
  // Transparencia total: cualquier miembro ve los gastos de todos.
  app.get<{ Querystring: { periodo?: string; casaId?: string; miembroId?: string } }>(
    '/api/gastos',
    { preHandler: requireAuth },
    async (req) => listarGastos(req.query)
  );

  app.post<{ Body: { casaId: string; categoriaId: string; monto: number; fecha: string; nota?: string } }>(
    '/api/gastos',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { casaId, categoriaId, monto, fecha } = req.body || ({} as any);
      if (!casaId || !categoriaId || typeof monto !== 'number' || monto <= 0 || !fecha) {
        return reply.code(400).send({ error: 'Revisa casa, categoría, monto y fecha' });
      }
      return crearGasto({
        miembroId: req.miembro!.miembroId,
        casaId,
        categoriaId,
        monto,
        fecha,
        nota: req.body.nota?.trim() || null,
      });
    }
  );

  // Un miembro solo puede editar o borrar los gastos que él mismo capturó
  // (el admin administra catálogos, no los gastos ajenos de otros).
  app.patch<{
    Params: { id: string };
    Body: { casaId: string; categoriaId: string; monto: number; fecha: string; nota?: string };
  }>('/api/gastos/:id', { preHandler: requireAuth }, async (req, reply) => {
    const gasto = buscarGastoPorId(req.params.id);
    if (!gasto) return reply.code(404).send({ error: 'Gasto no encontrado' });
    if (gasto.miembroId !== req.miembro!.miembroId) {
      return reply.code(403).send({ error: 'Solo puedes editar tus propios gastos' });
    }
    const { casaId, categoriaId, monto, fecha } = req.body || ({} as any);
    if (!casaId || !categoriaId || typeof monto !== 'number' || monto <= 0 || !fecha) {
      return reply.code(400).send({ error: 'Revisa casa, categoría, monto y fecha' });
    }
    return editarGasto(req.params.id, { casaId, categoriaId, monto, fecha, nota: req.body.nota?.trim() || null });
  });

  app.delete<{ Params: { id: string } }>('/api/gastos/:id', { preHandler: requireAuth }, async (req, reply) => {
    const gasto = buscarGastoPorId(req.params.id);
    if (!gasto) return reply.code(404).send({ error: 'Gasto no encontrado' });
    if (gasto.miembroId !== req.miembro!.miembroId) {
      return reply.code(403).send({ error: 'Solo puedes borrar tus propios gastos' });
    }
    eliminarGasto(req.params.id);
    return { ok: true };
  });
}
