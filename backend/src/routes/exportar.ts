import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { requireAdmin } from '../lib/authGuard.js';
import { listarGastos, listarTodosLosPresupuestos, listarMiembros, listarCasas, listarCategorias } from '../lib/db.js';

const FORMATO_MONEDA = '"$"#,##0.00';

function encabezado(hoja: ExcelJS.Worksheet) {
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
}

// Exportación completa (no solo el periodo que se esté viendo) pensada para
// que Jorge pueda armar sus propios cálculos financieros y de contabilidad
// en Excel -- por eso la hoja de Gastos es el histórico entero en crudo, no
// un resumen, y se le agregan hojas de referencia (miembros, casas,
// categorías, presupuestos) para no tener que cruzarlas a mano.
export default async function exportarRoutes(app: FastifyInstance) {
  app.get('/api/exportar/excel', { preHandler: requireAdmin }, async (req, reply) => {
    const gastos = listarGastos();
    const presupuestos = listarTodosLosPresupuestos();
    const miembros = listarMiembros();
    const casas = listarCasas();
    const categorias = listarCategorias();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Control Familiar';
    workbook.created = new Date();

    const hojaGastos = workbook.addWorksheet('Gastos');
    hojaGastos.columns = [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Miembro', key: 'miembro', width: 20 },
      { header: 'Casa', key: 'casa', width: 18 },
      { header: 'Categoría', key: 'categoria', width: 18 },
      { header: 'Monto', key: 'monto', width: 14, style: { numFmt: FORMATO_MONEDA } },
      { header: 'Nota', key: 'nota', width: 30 },
      { header: 'Registrado el', key: 'registradoEl', width: 18 },
    ];
    for (const g of gastos) {
      hojaGastos.addRow({
        fecha: g.fecha,
        miembro: g.miembroNombre,
        casa: g.casaNombre,
        categoria: g.categoriaNombre,
        monto: g.monto,
        nota: g.nota || '',
        registradoEl: g.creadoEn,
      });
    }
    encabezado(hojaGastos);

    const hojaPresupuestos = workbook.addWorksheet('Presupuestos');
    hojaPresupuestos.columns = [
      { header: 'Periodo', key: 'periodo', width: 12 },
      { header: 'Miembro', key: 'miembro', width: 20 },
      { header: 'Monto asignado', key: 'monto', width: 16, style: { numFmt: FORMATO_MONEDA } },
    ];
    for (const p of presupuestos) {
      hojaPresupuestos.addRow({ periodo: p.periodo, miembro: p.miembroNombre, monto: p.monto });
    }
    encabezado(hojaPresupuestos);

    // Un vistazo rápido por mes -- el detalle para armar tablas dinámicas o
    // fórmulas propias ya está en la hoja de Gastos.
    const totalesPorPeriodo = new Map<string, { gastado: number; presupuestado: number }>();
    for (const g of gastos) {
      const periodo = g.fecha.slice(0, 7);
      const actual = totalesPorPeriodo.get(periodo) || { gastado: 0, presupuestado: 0 };
      actual.gastado += g.monto;
      totalesPorPeriodo.set(periodo, actual);
    }
    for (const p of presupuestos) {
      const actual = totalesPorPeriodo.get(p.periodo) || { gastado: 0, presupuestado: 0 };
      actual.presupuestado += p.monto;
      totalesPorPeriodo.set(p.periodo, actual);
    }
    const hojaResumen = workbook.addWorksheet('Resumen por mes');
    hojaResumen.columns = [
      { header: 'Periodo', key: 'periodo', width: 12 },
      { header: 'Total gastado', key: 'gastado', width: 16, style: { numFmt: FORMATO_MONEDA } },
      { header: 'Total presupuestado', key: 'presupuestado', width: 18, style: { numFmt: FORMATO_MONEDA } },
      { header: 'Diferencia', key: 'diferencia', width: 16, style: { numFmt: FORMATO_MONEDA } },
    ];
    for (const periodo of [...totalesPorPeriodo.keys()].sort().reverse()) {
      const { gastado, presupuestado } = totalesPorPeriodo.get(periodo)!;
      hojaResumen.addRow({ periodo, gastado, presupuestado, diferencia: presupuestado - gastado });
    }
    encabezado(hojaResumen);

    const hojaMiembros = workbook.addWorksheet('Miembros');
    hojaMiembros.columns = [
      { header: 'Nombre', key: 'nombre', width: 20 },
      { header: 'Rol', key: 'rol', width: 14 },
      { header: 'Casa(s)', key: 'casas', width: 24 },
      { header: 'Sin presupuesto', key: 'sinPresupuesto', width: 14 },
      { header: 'Activo', key: 'activo', width: 10 },
    ];
    for (const m of miembros) {
      hojaMiembros.addRow({
        nombre: m.nombre,
        rol: m.rol === 'admin' ? 'Administrador' : 'Miembro',
        casas: m.todasLasCasas ? 'Todas' : m.casaNombres.join(', '),
        sinPresupuesto: m.sinPresupuesto ? 'Sí' : 'No',
        activo: m.activo ? 'Sí' : 'No',
      });
    }
    encabezado(hojaMiembros);

    const hojaCasas = workbook.addWorksheet('Casas');
    hojaCasas.columns = [
      { header: 'Nombre', key: 'nombre', width: 20 },
      { header: 'Activa', key: 'activo', width: 10 },
      { header: 'Gastos registrados', key: 'numGastos', width: 16 },
    ];
    for (const c of casas) hojaCasas.addRow({ nombre: c.nombre, activo: c.activo ? 'Sí' : 'No', numGastos: c.numGastos });
    encabezado(hojaCasas);

    const hojaCategorias = workbook.addWorksheet('Categorías');
    hojaCategorias.columns = [
      { header: 'Nombre', key: 'nombre', width: 20 },
      { header: 'Activa', key: 'activo', width: 10 },
      { header: 'Gastos registrados', key: 'numGastos', width: 16 },
    ];
    for (const c of categorias) hojaCategorias.addRow({ nombre: c.nombre, activo: c.activo ? 'Sí' : 'No', numGastos: c.numGastos });
    encabezado(hojaCategorias);

    const buffer = await workbook.xlsx.writeBuffer();
    const fecha = new Date().toISOString().slice(0, 10);
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="control-familiar-${fecha}.xlsx"`)
      .send(Buffer.from(buffer));
  });
}
