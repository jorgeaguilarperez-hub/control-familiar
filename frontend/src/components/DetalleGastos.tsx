import { useEffect, useState } from 'react';
import { listarGastos, editarGasto, listarCasas, listarCategorias, listarMiembros, type Gasto, type Casa, type Categoria, type Miembro } from '../lib/api';
import { formatMoney, formatDate } from '../lib/format';
import { mensajeDeError, useAuth } from '../lib/auth';
import { GastoForm } from './GastoForm';

// Filtro de una sola dimensión a la vez -- exactamente lo que hace falta al
// dar clic en una barra, una rebanada o una fila de "por miembro": siempre
// se acompaña del periodo que ya está seleccionado en Reportes.
export type FiltroDetalle =
  | { tipo: 'casa'; casaId: string; nombre: string }
  | { tipo: 'categoria'; categoriaId: string; nombre: string }
  | { tipo: 'miembro'; miembroId: string; nombre: string };

// Fila de un gasto, o (si se está corrigiendo) su formulario de edición en
// el mismo lugar -- así no hace falta salir de la ventana de detalle para
// arreglar un gasto mal capturado.
function FilaGasto({
  gasto,
  filtro,
  puedeEditar,
  esAdmin,
  casas,
  categorias,
  miembros,
  onGuardado,
}: {
  gasto: Gasto;
  filtro: FiltroDetalle;
  puedeEditar: boolean;
  esAdmin: boolean;
  casas: Casa[];
  categorias: Categoria[];
  miembros: Miembro[] | null;
  onGuardado: (actualizado: Gasto) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [miembroId, setMiembroId] = useState(gasto.miembroId);

  if (editando) {
    return (
      <li className="py-3 border-b border-[color:var(--border)] last:border-0">
        {/* Reasignar a otra persona es solo del administrador -- es quien
            revisa y corrige, no quien registra sus propios gastos. */}
        {esAdmin && miembros && (
          <div className="mb-2">
            <label className="block text-xs text-[color:var(--text-dim)] mb-1">Miembro</label>
            <select
              value={miembroId}
              onChange={(e) => setMiembroId(e.target.value)}
              className="w-full rounded-xl bg-[color:var(--surface-2)] border border-[color:var(--border)] px-3 py-2.5 outline-none focus:border-[color:var(--accent)]"
            >
              {miembros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        <GastoForm
          casas={casas}
          categorias={categorias}
          gastoAEditar={gasto}
          onCancelar={() => setEditando(false)}
          onGuardar={async (datos) => {
            const actualizado = await editarGasto(gasto.id, { ...datos, miembroId: esAdmin ? miembroId : undefined });
            setEditando(false);
            onGuardado(actualizado);
          }}
        />
      </li>
    );
  }

  return (
    <li className="py-2 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm truncate">
          {filtro.tipo === 'miembro' ? gasto.categoriaNombre : gasto.miembroNombre}
          {filtro.tipo !== 'casa' && <span className="text-[color:var(--text-dim)]"> · {gasto.casaNombre}</span>}
        </p>
        <p className="text-[11px] text-[color:var(--text-dim)]">
          {formatDate(gasto.fecha)}
          {gasto.nota && <> · {gasto.nota}</>}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-medium">{formatMoney(gasto.monto)}</span>
        {puedeEditar && (
          <button
            onClick={() => setEditando(true)}
            className="text-xs text-[color:var(--text-dim)] hover:text-[color:var(--accent)]"
          >
            Editar
          </button>
        )}
      </div>
    </li>
  );
}

export function DetalleGastos({
  periodo,
  filtro,
  onCerrar,
  onCambio,
}: {
  periodo: string;
  filtro: FiltroDetalle;
  onCerrar: () => void;
  // Se avisa hacia Reportes.tsx cada vez que se corrige un gasto, porque
  // puede haber cambiado de miembro, casa o categoría -- los totales y las
  // gráficas necesitan recalcularse, no solo esta lista.
  onCambio: () => void;
}) {
  const { miembro: yo } = useAuth();
  const esAdmin = yo?.rol === 'admin';
  const [gastos, setGastos] = useState<Gasto[] | null>(null);
  const [casas, setCasas] = useState<Casa[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const [error, setError] = useState('');

  function filtrosDeGastos() {
    return filtro.tipo === 'casa'
      ? { periodo, casaId: filtro.casaId }
      : filtro.tipo === 'categoria'
        ? { periodo, categoriaId: filtro.categoriaId }
        : { periodo, miembroId: filtro.miembroId };
  }

  async function cargar() {
    try {
      setGastos(await listarGastos(filtrosDeGastos()));
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  useEffect(() => {
    cargar();
    // Casas y categorías hacen falta para el formulario de corrección en
    // cuanto alguien le da "Editar" a un gasto -- se cargan de una vez para
    // que no haya que esperar en ese momento. La lista de miembros solo la
    // necesita el administrador (para reasignar), así que se omite para
    // cualquier otra persona.
    listarCasas().then(setCasas).catch(() => {});
    listarCategorias().then(setCategorias).catch(() => {});
    // El admin no puede tener gastos, así que no tiene caso ofrecerlo como
    // destino al reasignar.
    if (esAdmin) listarMiembros().then((ms) => setMiembros(ms.filter((m) => m.rol !== 'admin'))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <FilaGasto
                key={g.id}
                gasto={g}
                filtro={filtro}
                puedeEditar={esAdmin || g.miembroId === yo?.id}
                esAdmin={esAdmin}
                casas={casas}
                categorias={categorias}
                miembros={miembros}
                onGuardado={async () => {
                  await cargar();
                  onCambio();
                }}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
