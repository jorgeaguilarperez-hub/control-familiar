import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../lib/authGuard.js';
import { listarMiembros, listarPresupuestosDePeriodo, gastadoPorMiembro, reportePorCasa, reportePorCategoria } from '../lib/db.js';
import { periodoActual, estadoDePresupuesto } from '../lib/presupuestos.js';

export default async function reportesRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { periodo?: string } }>('/api/reportes/resumen', { preHandler: requireAuth }, async (req) => {
    const periodo = req.query.periodo || periodoActual();

    const miembros = listarMiembros().filter((m) => m.activo);
    const presupuestos = listarPresupuestosDePeriodo(periodo);
    const gastos = gastadoPorMiembro(periodo);

    const porMiembro = miembros.map((m) => {
      const presupuesto = presupuestos.find((p) => p.miembroId === m.id)?.monto ?? null;
      const gastado = gastos.find((g) => g.miembroId === m.id)?.gastado ?? 0;
      return {
        miembroId: m.id,
        nombre: m.nombre,
        casaNombre: m.casaNombre,
        presupuesto,
        gastado,
        estado: estadoDePresupuesto(gastado, presupuesto),
      };
    });

    return {
      periodo,
      porMiembro,
      porCasa: reportePorCasa(periodo),
      porCategoria: reportePorCategoria(periodo),
    };
  });
}
