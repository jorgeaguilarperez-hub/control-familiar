import type { FastifyInstance } from 'fastify';
import { requireAuth, requireAdmin } from '../lib/authGuard.js';
import { listarCasas, crearCasa, editarCasa, casaTieneGastos, eliminarCasa } from '../lib/db.js';

export default async function casasRoutes(app: FastifyInstance) {
  app.get('/api/casas', { preHandler: requireAuth }, async () => listarCasas());

  app.post<{ Body: { nombre: string } }>('/api/casas', { preHandler: requireAdmin }, async (req, reply) => {
    const nombre = req.body?.nombre?.trim();
    if (!nombre) return reply.code(400).send({ error: 'Falta el nombre de la casa' });
    return crearCasa(nombre);
  });

  // Renombrar y/o dar de baja (activo:false) / reactivar (activo:true) una
  // casa. Dar de baja no borra el historial de gastos: solo deja de
  // ofrecerse para gastos nuevos.
  app.patch<{ Params: { id: string }; Body: { nombre?: string; activo?: boolean } }>(
    '/api/casas/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const datos: { nombre?: string; activo?: boolean } = {};
      if (req.body?.nombre !== undefined) {
        const nombre = req.body.nombre.trim();
        if (!nombre) return reply.code(400).send({ error: 'El nombre no puede quedar vacío' });
        datos.nombre = nombre;
      }
      if (req.body?.activo !== undefined) datos.activo = req.body.activo;

      const actualizada = editarCasa(req.params.id, datos);
      if (!actualizada) return reply.code(404).send({ error: 'Casa no encontrada' });
      return actualizada;
    }
  );

  // Borrar una casa la borra de verdad -- si ya tenía gastos registrados,
  // esos gastos se van con ella (el frontend confirma esto con la persona
  // antes de llamar aquí, mostrándole cuántos gastos se perderían).
  app.delete<{ Params: { id: string } }>('/api/casas/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const teniaGastos = casaTieneGastos(req.params.id);
    eliminarCasa(req.params.id);
    return { ok: true, teniaGastos };
  });
}
