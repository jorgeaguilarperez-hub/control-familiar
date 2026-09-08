import { useEffect, useState } from 'react';
import { listarBitacora, borrarBitacora, listarMiembros, type EntradaBitacora, type FiltroBitacora, type Miembro } from '../lib/api';
import { formatDateTime, formatearEncabezadoFecha, formatearDispositivo, claveDia } from '../lib/format';
import { mensajeDeError } from '../lib/auth';

const FILTROS: { valor: FiltroBitacora; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'acceso', etiqueta: 'Accesos' },
  { valor: 'operacion', etiqueta: 'Operación' },
];

// Color del puntito según qué tan "buena" o "mala" es la entrada -- da una
// lectura rápida sin tener que leer cada descripción para saber si algo
// falló o si fue un cambio normal.
function colorDeTipo(tipo: EntradaBitacora['tipo']): string {
  if (tipo === 'login_fallido' || tipo === 'registro_fallido') return 'var(--bad)';
  if (
    tipo === 'passkey_revocada' ||
    tipo === 'miembro_borrado' ||
    tipo === 'casa_borrada' ||
    tipo === 'categoria_borrada' ||
    tipo === 'gasto_borrado' ||
    tipo === 'bitacora_borrada' ||
    tipo === 'cierre_por_inactividad'
  )
    return 'var(--warn)';
  if (tipo === 'login_exitoso' || tipo === 'registro_passkey' || tipo === 'passkey_agregada') return 'var(--good)';
  return 'var(--accent)';
}

function FilaEntrada({ entrada }: { entrada: EntradaBitacora }) {
  return (
    <li className="flex items-start gap-2.5 py-2">
      <span
        className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: colorDeTipo(entrada.tipo) }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm">{entrada.descripcion}</p>
        <p className="text-[11px] text-[color:var(--text-dim)] mt-0.5">
          {formatDateTime(entrada.creadoEn)}
          {entrada.userAgent && <> · {formatearDispositivo(entrada.userAgent)}</>}
          {entrada.ip && <> · {entrada.ip}</>}
        </p>
      </div>
    </li>
  );
}

export function Bitacora() {
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [filtro, setFiltro] = useState<FiltroBitacora>('todos');
  const [miembroId, setMiembroId] = useState('');
  const [entradas, setEntradas] = useState<EntradaBitacora[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [sospechosas, setSospechosas] = useState<{ ip: string; intentos: number }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState('');

  async function cargarDesdeElInicio() {
    setCargando(true);
    setError('');
    try {
      const r = await listarBitacora({ filtro, miembroId: miembroId || undefined });
      setEntradas(r.entradas);
      setHayMas(r.hayMas);
      setSospechosas(r.sospechosas);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    listarMiembros()
      .then(setMiembros)
      .catch(() => {});
  }, []);

  useEffect(() => {
    cargarDesdeElInicio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, miembroId]);

  async function cargarMas() {
    if (entradas.length === 0) return;
    setCargandoMas(true);
    try {
      const r = await listarBitacora({ filtro, miembroId: miembroId || undefined, antesDe: entradas[entradas.length - 1].id });
      setEntradas((prev) => [...prev, ...r.entradas]);
      setHayMas(r.hayMas);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargandoMas(false);
    }
  }

  async function borrarHistorialConfirmado() {
    if (
      !window.confirm(
        'Esto borra TODO el historial de la bitácora (accesos y operación) y no se puede deshacer. ¿Borrar de todas formas?'
      )
    )
      return;
    setBorrando(true);
    setError('');
    try {
      await borrarBitacora();
      await cargarDesdeElInicio();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setBorrando(false);
    }
  }

  // Agrupa por día conservando el orden que ya viene del servidor (más
  // reciente primero) -- solo intercala un encabezado cada vez que cambia
  // el día, sin reordenar nada.
  const grupos: { clave: string; encabezado: string; entradas: EntradaBitacora[] }[] = [];
  for (const e of entradas) {
    const clave = claveDia(e.creadoEn);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clave === clave) {
      ultimo.entradas.push(e);
    } else {
      grupos.push({ clave, encabezado: formatearEncabezadoFecha(e.creadoEn), entradas: [e] });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="heading text-xl font-semibold">Bitácora</h1>
        <button
          onClick={borrarHistorialConfirmado}
          disabled={borrando || entradas.length === 0}
          className="text-xs px-3 py-1.5 rounded-lg border border-[color:var(--border)] text-[color:var(--text-dim)] hover:text-[color:var(--bad)] disabled:opacity-60 active:scale-95 transition-transform"
        >
          {borrando ? 'Borrando…' : 'Borrar historial'}
        </button>
      </div>

      {error && <p className="text-sm text-[color:var(--bad)]">{error}</p>}

      {sospechosas.length > 0 && (
        <div className="rounded-xl border border-[color:var(--bad)] bg-[color:var(--surface-2)] p-3 text-xs space-y-1">
          <p className="font-medium text-[color:var(--bad)]">IPs con varios intentos fallidos en las últimas 24 horas:</p>
          {sospechosas.map((s) => (
            <p key={s.ip} className="text-[color:var(--text-dim)]">
              {s.ip} — {s.intentos} intento{s.intentos === 1 ? '' : 's'}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-[color:var(--border)] p-1">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                filtro === f.valor ? 'bg-[color:var(--surface-2)] text-[color:var(--text)]' : 'text-[color:var(--text-dim)]'
              }`}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
        <select
          value={miembroId}
          onChange={(e) => setMiembroId(e.target.value)}
          className="rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--border)] px-2 py-1.5 text-xs"
        >
          <option value="">Todos los miembros</option>
          {miembros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      </div>

      <section className="glass rounded-2xl p-5">
        {cargando ? (
          <p className="text-sm text-[color:var(--text-dim)]">Cargando…</p>
        ) : entradas.length === 0 ? (
          <p className="text-sm text-[color:var(--text-dim)]">No hay nada registrado todavía.</p>
        ) : (
          <div>
            {grupos.map((g) => (
              <div key={g.clave}>
                <h3 className="text-[11px] uppercase tracking-wide text-[color:var(--text-dim)] mt-4 mb-1 first:mt-0">
                  {g.encabezado}
                </h3>
                <ul className="divide-y divide-[color:var(--border)]">
                  {g.entradas.map((e) => (
                    <FilaEntrada key={e.id} entrada={e} />
                  ))}
                </ul>
              </div>
            ))}
            {hayMas && (
              <div className="mt-4 text-center">
                <button
                  onClick={cargarMas}
                  disabled={cargandoMas}
                  className="text-xs px-3 py-1.5 rounded-lg border border-[color:var(--border)] text-[color:var(--text-dim)] disabled:opacity-60"
                >
                  {cargandoMas ? 'Cargando…' : 'Cargar más'}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
