import { useEffect, useState } from 'react';
import { obtenerResumen, type Resumen } from '../lib/api';
import { formatMoney, formatPeriodo, periodoActualISO } from '../lib/format';
import { GraficaBarras, GraficaCircular, Leyenda } from '../components/ChartPanel';
import { BudgetBar } from '../components/BudgetBar';
import { Kpi } from '../components/Kpi';
import { mensajeDeError } from '../lib/auth';

function periodosRecientes(n: number): string[] {
  const lista: string[] = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return lista;
}

export function Reportes() {
  const [periodo, setPeriodo] = useState(periodoActualISO());
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    obtenerResumen(periodo)
      .then(setResumen)
      .catch((err) => setError(mensajeDeError(err)));
  }, [periodo]);

  const totalGastado = resumen?.porMiembro.reduce((s, m) => s + m.gastado, 0) ?? 0;
  const totalPresupuesto = resumen?.porMiembro.reduce((s, m) => s + (m.presupuesto ?? 0), 0) ?? 0;
  const enAlerta = resumen?.porMiembro.filter((m) => m.estado === 'alerta').length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="heading text-xl font-semibold">Reportes</h1>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="rounded-xl bg-[color:var(--surface-2)] border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
        >
          {periodosRecientes(6).map((p) => (
            <option key={p} value={p}>
              {formatPeriodo(p)}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-[color:var(--bad)]">{error}</p>}

      {resumen && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Kpi etiqueta="Gastado" valor={formatMoney(totalGastado)} />
            <Kpi etiqueta="Presupuestado" valor={formatMoney(totalPresupuesto)} />
            <Kpi etiqueta="En alerta" valor={String(enAlerta)} tono={enAlerta > 0 ? 'bad' : 'good'} />
          </div>

          <div className="glass rounded-2xl p-5">
            <h2 className="heading text-base font-semibold mb-4">Por miembro</h2>
            <div className="space-y-4">
              {resumen.porMiembro.map((m) => (
                <div key={m.miembroId}>
                  <div className="text-sm font-medium mb-1">
                    {m.nombre}
                    {m.casaNombre && <span className="text-[color:var(--text-dim)]"> · {m.casaNombre}</span>}
                  </div>
                  <BudgetBar gastado={m.gastado} presupuesto={m.presupuesto} estado={m.estado} compacto />
                </div>
              ))}
              {resumen.porMiembro.length === 0 && (
                <p className="text-sm text-[color:var(--text-dim)]">No hay miembros activos.</p>
              )}
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <h2 className="heading text-base font-semibold mb-2">Gasto por casa</h2>
            <GraficaBarras datos={resumen.porCasa} />
          </div>

          <div className="glass rounded-2xl p-5">
            <h2 className="heading text-base font-semibold mb-2">Gasto por categoría</h2>
            <GraficaCircular datos={resumen.porCategoria} />
            <Leyenda datos={resumen.porCategoria} />
          </div>
        </>
      )}
    </div>
  );
}
