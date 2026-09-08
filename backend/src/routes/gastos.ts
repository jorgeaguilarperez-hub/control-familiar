import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../lib/authGuard.js';
import { listarGastos, crearGasto, buscarGastoPorId, editarGasto, eliminarGasto } from '../lib/db.js';
import { bitacora } from '../lib/bitacora.js';

const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

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
      // El administrador es un rol solo para administrar el sistema: no
      // registra gastos propios (para eso está cualquier miembro regular).
      if (req.miembro!.rol === 'admin') {
        return reply.code(403).send({ error: 'El administrador no registra gastos' });
      }
      const { casaId, categoriaId, monto, fecha } = req.body || ({} as any);
      if (!casaId || !categoriaId || typeof monto !== 'number' || monto <= 0 || !fecha) {
        return reply.code(400).send({ error: 'Revisa casa, categoría, monto y fecha' });
      }
      const gasto = crearGasto({
        miembroId: req.miembro!.miembroId,
        casaId,
        categoriaId,
        monto,
        fecha,
        nota: req.body.nota?.trim() || null,
      });
      bitacora(req, {
        miembroId: req.miembro!.miembroId,
        nombreActor: req.miembro!.nombre,
        tipo: 'gasto_creado',
        categoria: 'operacion',
        descripcion: `${req.miembro!.nombre} registró un gasto de ${formatoMoneda.format(gasto.monto)} en ${gasto.categoriaNombre} (${gasto.casaNombre})`,
      });
      return gasto;
    }
  );

  // Un miembro solo puede editar o borrar los gastos que él mismo capturó
  // (el admin administra catálogos, no los gastos ajenos de otros).
  app.patch<{
    Params: { id: string };
    Body: { casaId: string; categoriaId: string; monto: number; fecha: string; nota?: string };
  }>('/api/gastos/:id', { preHandler: requireAuth }, async (req, reply) => {
    if (req.miembro!.rol === 'admin') {
      return reply.code(403).send({ error: 'El administrador no tiene funciones de gastos' });
    }
    const gasto = buscarGastoPorId(req.params.id);
    if (!gasto) return reply.code(404).send({ error: 'Gasto no encontrado' });
    if (gasto.miembroId !== req.miembro!.miembroId) {
      return reply.code(403).send({ error: 'Solo puedes editar tus propios gastos' });
    }
    const { casaId, categoriaId, monto, fecha } = req.body || ({} as any);
    if (!casaId || !categoriaId || typeof monto !== 'number' || monto <= 0 || !fecha) {
      return reply.code(400).send({ error: 'Revisa casa, categoría, monto y fecha' });
    }
    const actualizado = editarGasto(req.params.id, { casaId, categoriaId, monto, fecha, nota: req.body.nota?.trim() || null });
    bitacora(req, {
      miembroId: req.miembro!.miembroId,
      nombreActor: req.miembro!.nombre,
      tipo: 'gasto_editado',
      categoria: 'operacion',
      descripcion: `${req.miembro!.nombre} editó un gasto (ahora ${formatoMoneda.format(actualizado.monto)} en ${actualizado.categoriaNombre}, ${actualizado.casaNombre})`,
    });
    return actualizado;
  });

  app.delete<{ Params: { id: string } }>('/api/gastos/:id', { preHandler: requireAuth }, async (req, reply) => {
    if (req.miembro!.rol === 'admin') {
      return reply.code(403).send({ error: 'El administrador no tiene funciones de gastos' });
    }
    const gasto = buscarGastoPorId(req.params.id);
    if (!gasto) return reply.code(404).send({ error: 'Gasto no encontrado' });
    if (gasto.miembroId !== req.miembro!.miembroId) {
      return reply.code(403).send({ error: 'Solo puedes borrar tus propios gastos' });
    }
    eliminarGasto(req.params.id);
    bitacora(req, {
      miembroId: req.miembro!.miembroId,
      nombreActor: req.miembro!.nombre,
      tipo: 'gasto_borrado',
      categoria: 'operacion',
      descripcion: `${req.miembro!.nombre} borró un gasto de ${formatoMoneda.format(gasto.monto)} en ${gasto.categoriaNombre} (${gasto.casaNombre})`,
    });
    return { ok: true };
  });
}
