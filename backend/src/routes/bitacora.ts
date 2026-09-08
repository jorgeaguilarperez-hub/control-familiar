import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../lib/authGuard.js';
import { listarBitacora, contarIpsSospechosas, borrarBitacora, registrarBitacora, type FiltroBitacora } from '../lib/db.js';
import { infoDeAcceso } from '../lib/bitacora.js';

const FILTROS_VALIDOS: FiltroBitacora[] = ['todos', 'acceso', 'operacion'];

// Solo el administrador puede ver (y borrar) la bitácora -- a diferencia
// del resto del sistema, que es transparente entre miembros (todos ven los
// gastos de todos), esto es explícitamente una herramienta de supervisión
// del administrador, no algo que la familia vea entre sí.
export default async function bitacoraRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { limite?: string; antesDe?: string; filtro?: string; miembroId?: string } }>(
    '/api/bitacora',
    { preHandler: requireAdmin },
    async (req) => {
      const filtro = FILTROS_VALIDOS.includes(req.query.filtro as FiltroBitacora)
        ? (req.query.filtro as FiltroBitacora)
        : 'todos';

      const { entradas, hayMas } = listarBitacora({
        limite: req.query.limite ? Number(req.query.limite) : undefined,
        cursorId: req.query.antesDe,
        filtro,
        miembroId: req.query.miembroId || undefined,
      });

      // La alerta de IPs sospechosas se manda siempre completa (calculada
      // sobre toda la tabla) para que no dependa de qué página o filtro se
      // esté viendo -- el cliente decide si la muestra o no.
      return { entradas, hayMas, sospechosas: contarIpsSospechosas() };
    }
  );

  // Borra TODO el historial de un jalón -- pensado para cuando el
  // administrador decide que ya no lo necesita (por ejemplo, para no seguir
  // acumulando registros indefinidamente). Deja una entrada nueva anotando
  // el propio borrado, para que quede claro que se vació y quién lo hizo,
  // aunque el resto del historial ya no exista.
  app.delete('/api/bitacora', { preHandler: requireAdmin }, async (req) => {
    const eliminadas = borrarBitacora();
    registrarBitacora({
      miembroId: req.miembro!.miembroId,
      nombreActor: req.miembro!.nombre,
      tipo: 'bitacora_borrada',
      categoria: 'operacion',
      descripcion: `${req.miembro!.nombre} borró el historial completo de la bitácora (${eliminadas} registro${eliminadas === 1 ? '' : 's'})`,
      ...infoDeAcceso(req),
    });
    return { ok: true, eliminadas };
  });
}
