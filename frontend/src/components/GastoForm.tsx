import { useState, type FormEvent } from 'react';
import type { Casa, Categoria, Gasto } from '../lib/api';
import { hoyISO } from '../lib/format';

const NUEVA_CATEGORIA = '__nueva__';

export function GastoForm({
  casas,
  categorias,
  casaInicial,
  gastoAEditar,
  onGuardar,
  onCancelar,
  onNuevaCategoria,
}: {
  casas: Casa[];
  categorias: Categoria[];
  casaInicial?: string;
  gastoAEditar?: Gasto;
  onGuardar: (datos: { casaId: string; categoriaId: string; monto: number; fecha: string; nota?: string }) => Promise<void>;
  onCancelar?: () => void;
  // Cualquier miembro puede dar de alta una categoría nueva (concepto de
  // gasto) directamente desde aquí, sin pasar por el admin -- si se omite
  // esta prop, simplemente no se ofrece la opción.
  onNuevaCategoria?: (nombre: string) => Promise<Categoria>;
}) {
  const [casaId, setCasaId] = useState(gastoAEditar?.casaId || casaInicial || casas[0]?.id || '');
  const [categoriaId, setCategoriaId] = useState(gastoAEditar?.categoriaId || categorias[0]?.id || '');
  const [monto, setMonto] = useState(gastoAEditar ? String(gastoAEditar.monto) : '');
  const [fecha, setFecha] = useState(gastoAEditar?.fecha || hoyISO());
  const [nota, setNota] = useState(gastoAEditar?.nota || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [nuevaCategoriaNombre, setNuevaCategoriaNombre] = useState<string | null>(null);
  const [creandoCategoria, setCreandoCategoria] = useState(false);

  async function confirmarNuevaCategoria() {
    const nombre = (nuevaCategoriaNombre || '').trim();
    if (!nombre || !onNuevaCategoria) return;
    setCreandoCategoria(true);
    setError('');
    try {
      const categoria = await onNuevaCategoria(nombre);
      setCategoriaId(categoria.id);
      setNuevaCategoriaNombre(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la categoría');
    } finally {
      setCreandoCategoria(false);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const montoNum = Number(monto);
    if (!casaId || !categoriaId || !montoNum || montoNum <= 0 || !fecha) {
      setError('Revisa que casa, categoría, monto y fecha estén completos.');
      return;
    }
    setError('');
    setGuardando(true);
    try {
      await onGuardar({ casaId, categoriaId, monto: montoNum, fecha, nota: nota.trim() || undefined });
      if (!gastoAEditar) {
        setMonto('');
        setNota('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el gasto');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div>
        <label className="block text-xs text-[color:var(--text-dim)] mb-1">Monto</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          autoFocus
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="$0"
          className="w-full rounded-xl bg-[color:var(--surface-2)] border border-[color:var(--border)] px-4 py-3 text-2xl font-semibold outline-none focus:border-[color:var(--accent)]"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[color:var(--text-dim)] mb-1">Casa</label>
          <select
            value={casaId}
            onChange={(e) => setCasaId(e.target.value)}
            className="w-full rounded-xl bg-[color:var(--surface-2)] border border-[color:var(--border)] px-3 py-2.5 outline-none focus:border-[color:var(--accent)]"
          >
            {casas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[color:var(--text-dim)] mb-1">Categoría</label>
          {nuevaCategoriaNombre !== null ? (
            <div className="flex gap-1.5">
              <input
                autoFocus
                value={nuevaCategoriaNombre}
                onChange={(e) => setNuevaCategoriaNombre(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), confirmarNuevaCategoria())}
                placeholder="Nombre de la categoría"
                className="w-full rounded-xl bg-[color:var(--surface-2)] border border-[color:var(--accent)] px-3 py-2.5 outline-none"
              />
              <button
                type="button"
                onClick={confirmarNuevaCategoria}
                disabled={creandoCategoria}
                className="rounded-xl px-3 text-xs text-[color:var(--accent)]"
              >
                OK
              </button>
              <button type="button" onClick={() => setNuevaCategoriaNombre(null)} className="rounded-xl px-2 text-xs text-[color:var(--text-dim)]">
                ✕
              </button>
            </div>
          ) : (
            <select
              value={categoriaId}
              onChange={(e) => {
                if (e.target.value === NUEVA_CATEGORIA) setNuevaCategoriaNombre('');
                else setCategoriaId(e.target.value);
              }}
              className="w-full rounded-xl bg-[color:var(--surface-2)] border border-[color:var(--border)] px-3 py-2.5 outline-none focus:border-[color:var(--accent)]"
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
              {onNuevaCategoria && <option value={NUEVA_CATEGORIA}>+ Nueva categoría…</option>}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[color:var(--text-dim)] mb-1">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-xl bg-[color:var(--surface-2)] border border-[color:var(--border)] px-3 py-2.5 outline-none focus:border-[color:var(--accent)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[color:var(--text-dim)] mb-1">Nota (opcional)</label>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej. súper"
            className="w-full rounded-xl bg-[color:var(--surface-2)] border border-[color:var(--border)] px-3 py-2.5 outline-none focus:border-[color:var(--accent)]"
          />
        </div>
      </div>

      {error && <p className="text-sm text-[color:var(--bad)]">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={guardando} className="btn-primary flex-1 rounded-xl py-3 text-base">
          {guardando ? 'Guardando…' : gastoAEditar ? 'Guardar cambios' : 'Agregar gasto'}
        </button>
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-xl px-4 py-3 border border-[color:var(--border)] text-[color:var(--text-dim)]"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
