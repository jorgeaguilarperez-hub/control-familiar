import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { requireAdmin } from '../lib/authGuard.js';
import {
  listarGastos,
  listarTodosLosPresupuestos,
  listarMiembros,
  listarCasas,
  listarCategorias,
  listarPresupuestosDePeriodo,
  gastadoPorMiembro,
  reportePorCasa,
  reportePorCategoria,
} from '../lib/db.js';
import { periodoActual, estadoDePresupuesto } from '../lib/presupuestos.js';

const FORMATO_MONEDA = '"$"#,##0.00';
const FORMATO_PORCENTAJE = '0%';

// Paleta de Control Familiar (ver frontend/src/index.css) -- se reutiliza en
// el dashboard para que el Excel se sienta parte de la misma app en lugar de
// una hoja de cálculo genérica.
const COLOR = {
  panelOscuro: 'FF1B2233',
  fondoOscuro: 'FF141A26',
  textoTenue: 'FF8B93A7',
  acento: 'FF22D3EE',
  acento2: 'FFA78BFA',
  bien: 'FF34D399',
  mal: 'FFFB7185',
  aviso: 'FFFBBF24',
  blanco: 'FFFFFFFF',
  grisClaro: 'FFF2F4F8',
  grisBorde: 'FFE2E5EC',
} as const;

const COLOR_ESTADO: Record<string, { fill: string; font: string; texto: string }> = {
  ok: { fill: COLOR.bien, font: COLOR.blanco, texto: 'Al día' },
  aviso: { fill: COLOR.aviso, font: COLOR.panelOscuro, texto: 'Aviso' },
  alerta: { fill: COLOR.mal, font: COLOR.blanco, texto: 'Alerta' },
};

const NOMBRE_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function nombrePeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-');
  return `${NOMBRE_MES[Number(mes) - 1]} ${anio}`;
}

function formatoMoneda(valor: number): string {
  return `$${valor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function encabezado(hoja: ExcelJS.Worksheet) {
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
}

// ---------- Hoja "Dashboard" ----------
// Un vistazo ejecutivo del mes actual: KPIs grandes arriba y, debajo, tablas
// cortas con barras de datos (conditional formatting nativo de Excel, sin
// depender de imágenes ni de una librería de gráficas) para presupuesto vs.
// gasto por miembro, por categoría, por casa y la tendencia mensual. El
// detalle completo para armar cálculos propios sigue viviendo en las hojas
// de abajo (Gastos, Presupuestos, etc.) -- esta hoja es solo el resumen.
const ANCHO_TABLA = 8;

type OpcionesTabla = { montoCols?: number[]; pctCol?: number; estadoCol?: number; dataBarCol?: number };

function seccionTabla(
  hoja: ExcelJS.Worksheet,
  filaInicio: number,
  titulo: string,
  columnas: string[],
  filas: (string | number | null)[][],
  opciones: OpcionesTabla = {}
): number {
  let fila = filaInicio;

  hoja.mergeCells(fila, 1, fila, ANCHO_TABLA);
  const tituloCelda = hoja.getCell(fila, 1);
  tituloCelda.value = titulo;
  tituloCelda.font = { size: 12, bold: true, color: { argb: COLOR.panelOscuro } };
  hoja.getRow(fila).height = 22;
  fila++;

  const filaEncabezado = fila;
  columnas.forEach((texto, i) => {
    const celda = hoja.getCell(fila, i + 1);
    celda.value = texto;
    celda.font = { bold: true, color: { argb: COLOR.blanco } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.panelOscuro } };
    celda.alignment = { horizontal: i === 0 ? 'left' : 'center' };
  });
  fila++;

  const filaPrimerDato = fila;
  if (filas.length === 0) {
    hoja.mergeCells(fila, 1, fila, columnas.length);
    const celda = hoja.getCell(fila, 1);
    celda.value = 'Sin datos para este periodo.';
    celda.font = { italic: true, color: { argb: COLOR.textoTenue } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.grisClaro } };
    fila++;
  } else {
    filas.forEach((datos, indiceFila) => {
      const fondo = indiceFila % 2 === 0 ? COLOR.grisClaro : COLOR.blanco;
      datos.forEach((valor, i) => {
        const celda = hoja.getCell(fila, i + 1);
        celda.value = valor;
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fondo } };
        if (opciones.montoCols?.includes(i + 1)) celda.numFmt = FORMATO_MONEDA;
        if (opciones.pctCol === i + 1) celda.numFmt = FORMATO_PORCENTAJE;
        if (opciones.estadoCol === i + 1) {
          const info = Object.values(COLOR_ESTADO).find((e) => e.texto === valor);
          if (info) {
            celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: info.fill } };
            celda.font = { bold: true, color: { argb: info.font } };
            celda.alignment = { horizontal: 'center' };
          }
        }
      });
      fila++;
    });
  }
  const filaUltimoDato = fila - 1;

  if (opciones.dataBarCol && filaUltimoDato >= filaPrimerDato) {
    const columna = hoja.getColumn(opciones.dataBarCol).letter;
    // La librería sí soporta un color de barra (ver
    // lib/xlsx/xform/sheet/cf/databar-xform.js), pero su tipo TS no declara
    // el campo `color` en DataBarRuleType -- de ahí el cast.
    const reglaDataBar = {
      type: 'dataBar',
      priority: 1,
      gradient: false,
      border: false,
      cfvo: [{ type: 'min' }, { type: 'max' }],
      color: { argb: COLOR.acento },
    } as unknown as ExcelJS.ConditionalFormattingRule;
    hoja.addConditionalFormatting({
      ref: `${columna}${filaPrimerDato}:${columna}${filaUltimoDato}`,
      rules: [reglaDataBar],
    });
  }

  return fila + 1; // deja una fila en blanco antes de la siguiente sección
}

function construirDashboard(workbook: ExcelJS.Workbook, totalesPorPeriodo: Map<string, { gastado: number; presupuestado: number }>) {
  const periodo = periodoActual();
  const hoja = workbook.addWorksheet('Dashboard', { views: [{ showGridLines: false }] });
  hoja.columns = Array.from({ length: ANCHO_TABLA }, () => ({ width: 15 }));

  // Mismo cálculo que usa la pantalla de Reportes (ver routes/reportes.ts),
  // para que los números del Excel coincidan siempre con lo que Jorge ve en
  // la app.
  const miembros = listarMiembros().filter((m) => m.activo && m.rol !== 'admin' && !m.sinPresupuesto);
  const presupuestos = listarPresupuestosDePeriodo(periodo);
  const gastosPorMiembro = gastadoPorMiembro(periodo);
  const porMiembro = miembros.map((m) => {
    const presupuesto = presupuestos.find((p) => p.miembroId === m.id)?.monto ?? null;
    const gastado = gastosPorMiembro.find((g) => g.miembroId === m.id)?.gastado ?? 0;
    return { nombre: m.nombre, presupuesto, gastado, estado: estadoDePresupuesto(gastado, presupuesto) };
  });
  const porCasa = reportePorCasa(periodo)
    .filter((c) => c.gastado > 0)
    .sort((a, b) => b.gastado - a.gastado);
  const porCategoria = reportePorCategoria(periodo); // ya viene ordenada de mayor a menor

  const totalGastado = porMiembro.reduce((s, m) => s + m.gastado, 0);
  const totalPresupuesto = porMiembro.reduce((s, m) => s + (m.presupuesto ?? 0), 0);
  const porcentajeUsado = totalPresupuesto > 0 ? totalGastado / totalPresupuesto : 0;
  const enAlerta = porMiembro.filter((m) => m.estado === 'alerta').length;

  let fila = 1;

  // ---- Encabezado ----
  hoja.mergeCells(fila, 1, fila, ANCHO_TABLA);
  const titulo = hoja.getCell(fila, 1);
  titulo.value = 'Control Familiar · Dashboard Ejecutivo';
  titulo.font = { size: 18, bold: true, color: { argb: COLOR.blanco } };
  titulo.alignment = { vertical: 'middle', indent: 1 };
  hoja.getRow(fila).height = 32;
  for (let c = 1; c <= ANCHO_TABLA; c++) {
    hoja.getCell(fila, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.panelOscuro } };
  }
  fila++;

  hoja.mergeCells(fila, 1, fila, ANCHO_TABLA);
  const subtitulo = hoja.getCell(fila, 1);
  subtitulo.value = `Periodo actual: ${nombrePeriodo(periodo)}  ·  Generado el ${new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })}`;
  subtitulo.font = { size: 10, italic: true, color: { argb: COLOR.textoTenue } };
  subtitulo.alignment = { vertical: 'middle', indent: 1 };
  hoja.getRow(fila).height = 20;
  for (let c = 1; c <= ANCHO_TABLA; c++) {
    hoja.getCell(fila, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.fondoOscuro } };
  }
  fila += 2;

  // ---- KPIs ----
  const filaEtiquetas = fila;
  const filaValores = fila + 1;
  hoja.getRow(filaValores).height = 30;
  const kpis = [
    { etiqueta: 'TOTAL GASTADO', valor: formatoMoneda(totalGastado), color: COLOR.acento },
    { etiqueta: 'TOTAL PRESUPUESTADO', valor: formatoMoneda(totalPresupuesto), color: COLOR.acento2 },
    {
      etiqueta: '% USADO DEL PRESUPUESTO',
      valor: `${Math.round(porcentajeUsado * 100)}%`,
      color: porcentajeUsado >= 1 ? COLOR.mal : porcentajeUsado >= 0.8 ? COLOR.aviso : COLOR.bien,
    },
    { etiqueta: 'MIEMBROS EN ALERTA', valor: String(enAlerta), color: enAlerta > 0 ? COLOR.mal : COLOR.bien },
  ];
  kpis.forEach((kpi, i) => {
    const c1 = i * 2 + 1;
    const c2 = c1 + 1;
    hoja.mergeCells(filaEtiquetas, c1, filaEtiquetas, c2);
    const etiquetaCelda = hoja.getCell(filaEtiquetas, c1);
    etiquetaCelda.value = kpi.etiqueta;
    etiquetaCelda.font = { size: 9, bold: true, color: { argb: COLOR.textoTenue } };
    etiquetaCelda.alignment = { horizontal: 'center' };

    hoja.mergeCells(filaValores, c1, filaValores, c2);
    const valorCelda = hoja.getCell(filaValores, c1);
    valorCelda.value = kpi.valor;
    valorCelda.font = { size: 18, bold: true, color: { argb: kpi.color } };
    valorCelda.alignment = { horizontal: 'center' };

    for (let f = filaEtiquetas; f <= filaValores; f++) {
      for (const c of [c1, c2]) {
        hoja.getCell(f, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.grisClaro } };
      }
    }
  });
  fila = filaValores + 2;

  fila = seccionTabla(
    hoja,
    fila,
    'Presupuesto vs. gasto por miembro (mes actual)',
    ['Miembro', 'Presupuesto', 'Gastado', '% usado', 'Estado'],
    porMiembro.map((m) => {
      const pct = m.presupuesto && m.presupuesto > 0 ? m.gastado / m.presupuesto : null;
      return [m.nombre, m.presupuesto, m.gastado, pct, COLOR_ESTADO[m.estado].texto];
    }),
    { montoCols: [2, 3], pctCol: 4, estadoCol: 5, dataBarCol: 3 }
  );

  fila = seccionTabla(
    hoja,
    fila,
    'Gasto por categoría (mes actual)',
    ['Categoría', 'Gastado'],
    porCategoria.map((c) => [c.nombre, c.gastado]),
    { montoCols: [2], dataBarCol: 2 }
  );

  fila = seccionTabla(
    hoja,
    fila,
    'Gasto por casa (mes actual)',
    ['Casa', 'Gastado'],
    porCasa.map((c) => [c.nombre, c.gastado]),
    { montoCols: [2], dataBarCol: 2 }
  );

  const tendencia = [...totalesPorPeriodo.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  seccionTabla(
    hoja,
    fila,
    'Tendencia mensual (gastado)',
    ['Periodo', 'Gastado'],
    tendencia.map(([p, t]) => [nombrePeriodo(p), t.gastado]),
    { montoCols: [2], dataBarCol: 2 }
  );
}

// Exportación completa (no solo el periodo que se esté viendo) pensada para
// que Jorge pueda armar sus propios cálculos financieros y de contabilidad
// en Excel -- por eso la hoja de Gastos es el histórico entero en crudo, no
// un resumen, y se le agregan hojas de referencia (miembros, casas,
// categorías, presupuestos) para no tener que cruzarlas a mano. La primera
// hoja (Dashboard) es el resumen ejecutivo del mes actual.
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

    // Se calcula antes que nada porque tanto el Dashboard (tendencia
    // mensual) como la hoja "Resumen por mes" lo necesitan.
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

    construirDashboard(workbook, totalesPorPeriodo);

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
