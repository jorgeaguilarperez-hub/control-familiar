import type { FastifyInstance } from 'fastify';
import { requireAuth, requireAdmin } from '../lib/authGuard.js';
import {
  listarMiembros,
  crearMiembro,
  editarMiembro,
  eliminarMiembro,
  buscarMiembroPorId,
  contarAdminsActivos,
  crearInvitacion,
  credencialesDeMiembro,
  eliminarCredencial,
  type Rol,
} from '../lib/db.js';

function invitacionParaCliente(token: string) {
  // El frontend arma la URL completa (conoce su propio origen); aquí solo
  // se regresa el token y la ruta relativa donde se consume.
  return { token, ruta: `/invitacion/${token}` };
}

export default async function miembrosRoutes(app: FastifyInstance) {
  // Transparencia total: cualquier miembro autenticado ve a toda la
  // familia (y quién está en línea ahora mismo).
  app.get('/api/miembros', { preHandler: requireAuth }, async () => listarMiembros());

  app.post<{ Body: { nombre: string; casaId: string | null; rol?: Rol } }>(
    '/api/miembros',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const nombre = req.body?.nombre?.trim();
      if (!nombre) return reply.code(400).send({ error: 'Falta el nombre' });
      const miembro = crearMiembro({ nombre, casaId: req.body.casaId ?? null, rol: req.body.rol === 'admin' ? 'admin' : 'miembro' });
      const invitacion = crearInvitacion(miembro.id);
      return { miembro, invitacion: invitacionParaCliente(invitacion.token) };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/miembros/:id/invitacion',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const miembro = buscarMiembroPorId(req.params.id);
      if (!miembro) return reply.code(404).send({ error: 'Miembro no encontrado' });
      const invitacion = crearInvitacion(miembro.id);
      return { invitacion: invitacionParaCliente(invitacion.token) };
    }
  );

  app.patch<{ Params: { id: string }; Body: { nombre?: string; casaId?: string | null; rol?: Rol; activo?: boolean } }>(
    '/api/miembros/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const miembro = buscarMiembroPorId(req.params.id);
      if (!miembro) return reply.code(404).send({ error: 'Miembro no encontrado' });

      // No dejar que la familia se quede sin ningún administrador activo
      // (ni quitándole el rol, ni dándolo de baja).
      const dejaDeSerAdmin = miembro.rol === 'admin' && (req.body.rol === 'miembro' || req.body.activo === false);
      if (dejaDeSerAdmin && contarAdminsActivos(miembro.id) === 0) {
        return reply.code(409).send({ error: 'Debe quedar al menos un administrador activo' });
      }

      const actualizado = editarMiembro(req.params.id, req.body);
      return actualizado;
    }
  );

  // Borrar a un miembro lo borra de verdad (ya no existe "dar de baja" que
  // lo deje inactivo): pierde su passkey y, si ya tenía gastos o
  // presupuestos, se van con él. El frontend confirma esto con la persona
  // antes de llamar aquí.
  app.delete<{ Params: { id: string } }>('/api/miembros/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const miembro = buscarMiembroPorId(req.params.id);
    if (!miembro) return reply.code(404).send({ error: 'Miembro no encontrado' });

    // No dejar que la familia se quede sin ningún administrador.
    if (miembro.rol === 'admin' && contarAdminsActivos(miembro.id) === 0) {
      return reply.code(409).send({ error: 'Debe quedar al menos un administrador activo' });
    }

    const teniaGastos = miembro.numGastos > 0;
    eliminarMiembro(req.params.id);
    return { ok: true, teniaGastos };
  });

  // Ver y revocar las passkeys de un miembro una por una -- sin borrar al
  // miembro completo, por ejemplo cuando perdió o cambió de dispositivo. No
  // se manda la llave pública ni el contador: eso es material criptográfico
  // interno, el frontend solo necesita mostrar y dejar borrar.
  app.get<{ Params: { id: string } }>(
    '/api/miembros/:id/credenciales',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const miembro = buscarMiembroPorId(req.params.id);
      if (!miembro) return reply.code(404).send({ error: 'Miembro no encontrado' });
      return credencialesDeMiembro(req.params.id).map((c) => ({
        id: c.id,
        creadoEn: c.creadoEn,
        transports: c.transports,
      }));
    }
  );

  app.delete<{ Params: { id: string; credencialId: string } }>(
    '/api/miembros/:id/credenciales/:credencialId',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const credenciales = credencialesDeMiembro(req.params.id);
      const credencial = credenciales.find((c) => c.id === req.params.credencialId);
      if (!credencial) return reply.code(404).send({ error: 'Passkey no encontrada' });

      // Caso límite real: si el admin se revoca a sí mismo su última
      // passkey y es el único administrador activo, nadie -- ni él mismo --
      // podría volver a entrar para arreglarlo (no hay otra forma de
      // autenticarse en este sistema). Se bloquea igual que ya se bloquea
      // borrarlo o quitarle el rol de admin en esas condiciones.
      const esSuPropiaUltimaPasskey = req.miembro?.miembroId === req.params.id && credenciales.length === 1;
      if (esSuPropiaUltimaPasskey && contarAdminsActivos(req.params.id) === 0) {
        return reply.code(409).send({ error: 'No puedes revocar tu única passkey siendo el único administrador: quedarías sin forma de volver a entrar' });
      }

      eliminarCredencial(credencial.id);
      return { ok: true };
    }
  );
}
