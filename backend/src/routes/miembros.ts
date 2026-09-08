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
  listarCasas,
  type Rol,
} from '../lib/db.js';
import { bitacora } from '../lib/bitacora.js';

function invitacionParaCliente(token: string) {
  // El frontend arma la URL completa (conoce su propio origen); aquí solo
  // se regresa el token y la ruta relativa donde se consume.
  return { token, ruta: `/invitacion/${token}` };
}

// Arma una descripción legible de qué cambió en un PATCH -- solo lista los
// campos que de verdad llegaron en el body (no todo el estado resultante),
// para que la bitácora diga justo qué se tocó en esa edición en particular.
function describirCambiosMiembro(body: {
  nombre?: string;
  casaIds?: string[];
  todasLasCasas?: boolean;
  rol?: Rol;
  activo?: boolean;
  sinPresupuesto?: boolean;
}): string {
  const partes: string[] = [];
  if (body.nombre !== undefined) partes.push(`nombre → "${body.nombre}"`);
  if (body.rol !== undefined) partes.push(`rol → ${body.rol === 'admin' ? 'Administrador' : 'Miembro'}`);
  if (body.activo !== undefined) partes.push(body.activo ? 'reactivado' : 'dado de baja');
  if (body.sinPresupuesto !== undefined) {
    partes.push(body.sinPresupuesto ? 'marcado "sin presupuesto"' : 'ya no "sin presupuesto"');
  }
  if (body.todasLasCasas) {
    partes.push('casas → todas');
  } else if (body.casaIds !== undefined) {
    const nombres = listarCasas()
      .filter((c) => body.casaIds!.includes(c.id))
      .map((c) => c.nombre);
    partes.push(`casas → ${nombres.length ? nombres.join(', ') : 'ninguna'}`);
  }
  return partes.length ? partes.join('; ') : 'sin cambios';
}

export default async function miembrosRoutes(app: FastifyInstance) {
  // Transparencia total: cualquier miembro autenticado ve a toda la
  // familia (y quién está en línea ahora mismo).
  app.get('/api/miembros', { preHandler: requireAuth }, async () => listarMiembros());

  app.post<{ Body: { nombre: string; casaIds?: string[]; todasLasCasas?: boolean; rol?: Rol } }>(
    '/api/miembros',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const nombre = req.body?.nombre?.trim();
      if (!nombre) return reply.code(400).send({ error: 'Falta el nombre' });
      const miembro = crearMiembro({
        nombre,
        casaIds: req.body.casaIds,
        todasLasCasas: req.body.todasLasCasas,
        rol: req.body.rol === 'admin' ? 'admin' : 'miembro',
      });
      const invitacion = crearInvitacion(miembro.id);
      bitacora(req, {
        miembroId: req.miembro!.miembroId,
        nombreActor: req.miembro!.nombre,
        tipo: 'miembro_creado',
        categoria: 'operacion',
        descripcion: `${req.miembro!.nombre} dio de alta a ${miembro.nombre}`,
      });
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
      bitacora(req, {
        miembroId: req.miembro!.miembroId,
        nombreActor: req.miembro!.nombre,
        tipo: 'invitacion_generada',
        categoria: 'operacion',
        descripcion: `${req.miembro!.nombre} generó un enlace de invitación para ${miembro.nombre}`,
      });
      return { invitacion: invitacionParaCliente(invitacion.token) };
    }
  );

  app.patch<{
    Params: { id: string };
    Body: { nombre?: string; casaIds?: string[]; todasLasCasas?: boolean; rol?: Rol; activo?: boolean; sinPresupuesto?: boolean };
  }>(
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
      bitacora(req, {
        miembroId: req.miembro!.miembroId,
        nombreActor: req.miembro!.nombre,
        tipo: 'miembro_editado',
        categoria: 'operacion',
        descripcion: `${req.miembro!.nombre} editó a ${miembro.nombre}: ${describirCambiosMiembro(req.body)}`,
      });
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
    bitacora(req, {
      miembroId: req.miembro!.miembroId,
      nombreActor: req.miembro!.nombre,
      tipo: 'miembro_borrado',
      categoria: 'operacion',
      descripcion: `${req.miembro!.nombre} borró a ${miembro.nombre}`,
    });
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
      const nombreDueño = buscarMiembroPorId(req.params.id)?.nombre ?? 'un miembro';
      bitacora(req, {
        miembroId: req.miembro!.miembroId,
        nombreActor: req.miembro!.nombre,
        tipo: 'passkey_revocada',
        categoria: 'acceso',
        descripcion:
          req.miembro!.miembroId === req.params.id
            ? `${req.miembro!.nombre} se revocó una de sus propias passkeys`
            : `${req.miembro!.nombre} revocó una passkey de ${nombreDueño}`,
      });
      return { ok: true };
    }
  );
}
