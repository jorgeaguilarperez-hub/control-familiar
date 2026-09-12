import { useEffect, useState } from 'react';
import { listarGastos, type Gasto } from '../lib/api';
import { formatMoney, formatDate } from '../lib/format';
import { mensajeDeError } from '../lib/auth';

// Filtro de una sola dimensión a la vez -- exactamente lo que hace falta al
// dar doble clic en una barra, una rebanada o una fila de "por miembro":
// siempre se acompaña del periodo que ya está seleccionado en Reportes.
export type FiltroDetalle =
  | { tipo: 'casa'; casaId: string; nombre: string }
  | { tipo: 'categoria'; categoriaId: string; nombre: string }
  | { tipo: 'miembro'; miembroId: string; nombre: string };

export function DetalleGastos({ periodo, filtro, onCerrar }: { periodo: string; filtro: FiltroDetalle; onCerrar: () => void }) {
  const [gastos, setGastos] = useState<Gasto[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const filtros =
      filtro.tipo === 'casa'
        ? { periodo, casaId: filtro.casaId }
        : filtro.tipo === 'categoria'
          ? { periodo, categoriaId: filtro.categoriaId }
          : { periodo, miembroId: filtro.miembroId };
    listarGastos(filtros)
      .then(setGastos)
      .catch((err) => setError(mensajeDeError(err)));
  }, [periodo, filtro]);

  useEffect(() => {
    function alTecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar();
    }
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = gastos?.reduce((s, g) => s + g.monto, 0) ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCerrar}
    >
      <div
        className="glass rounded-2xl p-5 w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="heading text-base font-semibold">{filtro.nombre}</h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-[color:var(--text-dim)] hover:text-[color:var(--text)] text-xl leading-none px-1"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-[color:var(--text-dim)] mb-3">
          {gastos ? `${gastos.length} gasto${gastos.length === 1 ? '' : 's'} · total ${formatMoney(total)}` : 'Cargando…'}
        </p>

        {error && <p className="text-sm text-[color:var(--bad)]">{error}</p>}

        <div className="overflow-y-auto -mx-1 px-1">
          {gastos?.length === 0 && (
            <p className="text-sm text-[color:var(--text-dim)] py-4 text-center">No hay gastos registrados aquí.</p>
          )}
          <ul className="divide-y divide-[color:var(--border)]">
            {gastos?.map((g) => (
              <li key={g.id} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm truncate">
                    {filtro.tipo === 'miembro' ? g.categoriaNombre : g.miembroNombre}
                    {filtro.tipo !== 'casa' && <span className="text-[color:var(--text-dim)]"> · {g.casaNombre}</span>}
                  </p>
                  <p className="text-[11px] text-[color:var(--text-dim)]">
                    {formatDate(g.fecha)}
                    {g.nota && <> · {g.nota}</>}
                  </p>
                </div>
                <span className="text-sm font-medium flex-shrink-0">{formatMoney(g.monto)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
