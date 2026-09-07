import type { FastifyInstance } from 'fastify';
import { requireAuth, requireAdmin } from '../lib/authGuard.js';
import {
  listarCategorias,
  crearCategoria,
  editarCategoria,
  categoriaTieneGastos,
  eliminarCategoria,
} from '../lib/db.js';

export default async function categoriasRoutes(app: FastifyInstance) {
  app.get('/api/categorias', { preHandler: requireAuth }, async () => listarCategorias());

  // Dar de alta una categoría (concepto de gasto) nueva la puede hacer
  // cualquier miembro -- si a alguien le falta una categoría al capturar un
  // gasto, no debería tener que esperar al administrador para poder
  // registrarlo. Editar o dar de baja sí queda solo para el admin (abajo).
  app.post<{ Body: { nombre: string } }>('/api/categorias', { preHandler: requireAuth }, async (req, reply) => {
    const nombre = req.body?.nombre?.trim();
    if (!nombre) return reply.code(400).send({ error: 'Falta el nombre de la categoría' });
    return crearCategoria(nombre);
  });

  // Renombrar y/o dar de baja (activo:false) / reactivar una categoría.
  // Dar de baja no borra el historial: solo deja de ofrecerse para gastos
  // nuevos.
  app.patch<{ Params: { id: string }; Body: { nombre?: string; activo?: boolean } }>(
    '/api/categorias/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const datos: { nombre?: string; activo?: boolean } = {};
      if (req.body?.nombre !== undefined) {
        const nombre = req.body.nombre.trim();
        if (!nombre) return reply.code(400).send({ error: 'El nombre no puede quedar vacío' });
        datos.nombre = nombre;
      }
      if (req.body?.activo !== undefined) datos.activo = req.body.activo;

      const actualizada = editarCategoria(req.params.id, datos);
      if (!actualizada) return reply.code(404).send({ error: 'Categoría no encontrada' });
      return actualizada;
    }
  );

  // Borrar una categoría la borra de verdad -- si ya tenía gastos
  // registrados, esos gastos se van con ella (el frontend confirma esto
  // con la persona antes de llamar aquí).
  app.delete<{ Params: { id: string } }>('/api/categorias/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const teniaGastos = categoriaTieneGastos(req.params.id);
    eliminarCategoria(req.params.id);
    return { ok: true, teniaGastos };
  });
}
