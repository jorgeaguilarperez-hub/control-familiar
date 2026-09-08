import type { FastifyInstance } from 'fastify';
import { requireAuth, requireAdmin } from '../lib/authGuard.js';
import { listarCasas, crearCasa, editarCasa, casaTieneGastos, eliminarCasa } from '../lib/db.js';
import { bitacora } from '../lib/bitacora.js';

export default async function casasRoutes(app: FastifyInstance) {
  app.get('/api/casas', { preHandler: requireAuth }, async () => listarCasas());

  app.post<{ Body: { nombre: string } }>('/api/casas', { preHandler: requireAdmin }, async (req, reply) => {
    const nombre = req.body?.nombre?.trim();
    if (!nombre) return reply.code(400).send({ error: 'Falta el nombre de la casa' });
    const casa = crearCasa(nombre);
    bitacora(req, {
      miembroId: req.miembro!.miembroId,
      nombreActor: req.miembro!.nombre,
      tipo: 'casa_creada',
      categoria: 'operacion',
      descripcion: `${req.miembro!.nombre} creó la casa "${casa.nombre}"`,
    });
    return casa;
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

      const anterior = listarCasas().find((c) => c.id === req.params.id);
      const actualizada = editarCasa(req.params.id, datos);
      if (!actualizada) return reply.code(404).send({ error: 'Casa no encontrada' });
      const cambios: string[] = [];
      if (datos.nombre !== undefined && anterior && datos.nombre !== anterior.nombre) {
        cambios.push(`renombrada a "${datos.nombre}"`);
      }
      if (datos.activo !== undefined) cambios.push(datos.activo ? 'reactivada' : 'dada de baja');
      bitacora(req, {
        miembroId: req.miembro!.miembroId,
        nombreActor: req.miembro!.nombre,
        tipo: 'casa_editada',
        categoria: 'operacion',
        descripcion: `${req.miembro!.nombre} editó la casa "${anterior?.nombre ?? actualizada.nombre}"${cambios.length ? `: ${cambios.join(', ')}` : ''}`,
      });
      return actualizada;
    }
  );

  // Borrar una casa la borra de verdad -- si ya tenía gastos registrados,
  // esos gastos se van con ella (el frontend confirma esto con la persona
  // antes de llamar aquí, mostrándole cuántos gastos se perderían).
  app.delete<{ Params: { id: string } }>('/api/casas/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const casa = listarCasas().find((c) => c.id === req.params.id);
    const teniaGastos = casaTieneGastos(req.params.id);
    eliminarCasa(req.params.id);
    bitacora(req, {
      miembroId: req.miembro!.miembroId,
      nombreActor: req.miembro!.nombre,
      tipo: 'casa_borrada',
      categoria: 'operacion',
      descripcion: `${req.miembro!.nombre} borró la casa "${casa?.nombre ?? req.params.id}"`,
    });
    return { ok: true, teniaGastos };
  });
}
