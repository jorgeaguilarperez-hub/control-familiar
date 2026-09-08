import { useEffect, useState, type FormEvent } from 'react';
import {
  listarCasas,
  crearCasa,
  editarCasa,
  borrarCasa,
  listarCategorias,
  crearCategoria,
  editarCategoria,
  borrarCategoria,
  listarMiembros,
  crearMiembro,
  editarMiembro,
  borrarMiembro,
  regenerarInvitacion,
  listarCredenciales,
  borrarCredencial,
  obtenerPresupuestos,
  asignarPresupuesto,
  type Casa,
  type Categoria,
  type Miembro,
  type Rol,
  type Credencial,
} from '../lib/api';
import { formatMoney, periodoActualISO, formatearRelativo } from '../lib/format';
import { mensajeDeError, useAuth } from '../lib/auth';

function CampoNuevo({ placeholder, onCrear }: { placeholder: string; onCrear: (nombre: string) => Promise<void> }) {
  const [valor, setValor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!valor.trim()) return;
    setGuardando(true);
    setError('');
    try {
      await onCrear(valor.trim());
      setValor('');
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <form onSubmit={enviar} className="flex gap-2">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-xl bg-[color:var(--surface-2)] border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
        />
        <button disabled={guardando} className="btn-primary rounded-xl px-4 py-2 text-sm">
          Agregar
        </button>
      </form>
      {error && <p className="text-xs text-[color:var(--bad)] mt-1.5">{error}</p>}
    </div>
  );
}

// Fila con renombrar (inline) y borrar -- reutilizada para casas y
// categorías, que comparten exactamente el mismo patrón. Borrar es
// definitivo: si el ítem ya tiene gastos registrados, se pide confirmación
// explícita porque esos gastos se borran junto con él.
function FilaCatalogo({
  item,
  onRenombrar,
  onBorrar,
}: {
  item: { id: string; nombre: string; numGastos: number };
  onRenombrar: (nombre: string) => Promise<void>;
  onBorrar: () => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(item.nombre);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  async function guardar() {
    const nombre = valor.trim();
    if (!nombre || nombre === item.nombre) {
      setEditando(false);
      setValor(item.nombre);
      return;
    }
    setGuardando(true);
    try {
      await onRenombrar(nombre);
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarYBorrar() {
    const mensaje =
      item.numGastos > 0
        ? `"${item.nombre}" tiene ${item.numGastos} gasto(s) registrado(s). Si la borras, esos gastos también se borran y no se pueden recuperar. ¿Borrar de todas formas?`
        : `¿Borrar "${item.nombre}"? Esto no se puede deshacer.`;
    if (!window.confirm(mensaje)) return;
    setBorrando(true);
    try {
      await onBorrar();
    } finally {
      setBorrando(false);
    }
  }

  return (
    <li className="flex items-center gap-2 py-1">
      {editando ? (
        <>
          <input
            autoFocus
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') guardar();
              if (e.key === 'Escape') {
                setEditando(false);
                setValor(item.nombre);
              }
            }}
            className="flex-1 rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--accent)] px-2 py-1 text-sm outline-none"
          />
          <button onClick={guardar} disabled={guardando} className="text-xs text-[color:var(--accent)]">
            Guardar
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm">
            {item.nombre}
            {item.numGastos > 0 && (
              <span className="ml-2 text-[10px] text-[color:var(--text-dim)]">
                {item.numGastos} gasto{item.numGastos === 1 ? '' : 's'}
              </span>
            )}
          </span>
          <button onClick={() => setEditando(true)} className="text-xs text-[color:var(--text-dim)] hover:text-[color:var(--accent)]">
            Renombrar
          </button>
          <button
            onClick={confirmarYBorrar}
            disabled={borrando}
            className="text-xs text-[color:var(--text-dim)] hover:text-[color:var(--bad)]"
          >
            {borrando ? 'Borrando…' : 'Borrar'}
          </button>
        </>
      )}
    </li>
  );
}

// Nombre de un miembro con renombrar inline -- a diferencia de FilaCatalogo
// (casas/categorías), aquí el borrado va en un botón aparte más abajo en la
// fila, así que este componente solo maneja el nombre.
function NombreMiembro({ miembro, onRenombrar }: { miembro: Miembro; onRenombrar: (nombre: string) => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(miembro.nombre);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const nombre = valor.trim();
    if (!nombre || nombre === miembro.nombre) {
      setEditando(false);
      setValor(miembro.nombre);
      return;
    }
    setGuardando(true);
    try {
      await onRenombrar(nombre);
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  if (editando) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') guardar();
            if (e.key === 'Escape') {
              setEditando(false);
              setValor(miembro.nombre);
            }
          }}
          className="rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--accent)] px-2 py-1 text-sm outline-none"
        />
        <button onClick={guardar} disabled={guardando} className="text-xs text-[color:var(--accent)]">
          Guardar
        </button>
      </div>
    );
  }

  return (
    <div className="font-medium text-sm flex items-center gap-2">
      {miembro.nombre}
      <button
        onClick={() => setEditando(true)}
        className="text-[10px] text-[color:var(--text-dim)] hover:text-[color:var(--accent)]"
      >
        Renombrar
      </button>
    </div>
  );
}

// Un miembro puede quedar asignado a una casa, varias, o -- con la casilla
// "Todas las casas" -- a todas (incluidas las que se creen después). Se
// reutiliza tanto para dar de alta como para reasignar a alguien que ya
// existe.
function SelectorCasas({
  casas,
  casaIds,
  todasLasCasas,
  onCambiar,
}: {
  casas: Casa[];
  casaIds: string[];
  todasLasCasas: boolean;
  onCambiar: (casaIds: string[], todasLasCasas: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--text-dim)]">
        <input type="checkbox" checked={todasLasCasas} onChange={(e) => onCambiar(casaIds, e.target.checked)} />
        Todas las casas
      </label>
      {!todasLasCasas && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {casas.length === 0 && <span className="text-xs text-[color:var(--text-dim)]">Todavía no hay casas.</span>}
          {casas.map((c) => (
            <label key={c.id} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={casaIds.includes(c.id)}
                onChange={(e) => {
                  const nuevos = e.target.checked ? [...casaIds, c.id] : casaIds.filter((id) => id !== c.id);
                  onCambiar(nuevos, false);
                }}
              />
              {c.nombre}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function etiquetaTransporte(transports: string | null): string {
  try {
    const lista: string[] = transports ? JSON.parse(transports) : [];
    if (lista.includes('internal')) return 'Face ID / Touch ID de ese dispositivo';
    if (lista.length > 0) return 'Llave de seguridad u otro dispositivo';
  } catch {
    // formato inesperado -- se queda con la etiqueta genérica de abajo
  }
  return 'Passkey';
}

// Ver y revocar, una por una, las passkeys de un miembro -- sin borrarlo
// por completo. Antes de esto, la única forma de "resetear" el acceso de
// alguien era borrar a la persona entera (perdiendo su historial de
// gastos) y volver a darla de alta.
function PasskeysDeMiembro({ miembro }: { miembro: Miembro }) {
  const [abierto, setAbierto] = useState(false);
  const [credenciales, setCredenciales] = useState<Credencial[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [revocandoId, setRevocandoId] = useState<string | null>(null);

  async function alternar() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setAbierto(true);
    setCargando(true);
    setError('');
    try {
      setCredenciales(await listarCredenciales(miembro.id));
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargando(false);
    }
  }

  async function revocar(credencialId: string) {
    if (!window.confirm('¿Revocar esta passkey? Ese dispositivo ya no va a poder usarse para entrar.')) return;
    setRevocandoId(credencialId);
    try {
      await borrarCredencial(miembro.id, credencialId);
      setCredenciales((prev) => prev?.filter((c) => c.id !== credencialId) ?? null);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setRevocandoId(null);
    }
  }

  if (miembro.numCredenciales === 0) {
    return <p className="text-xs text-[color:var(--text-dim)]">Sin passkeys registradas todavía.</p>;
  }

  return (
    <div className="text-xs">
      <button onClick={alternar} className="text-[color:var(--text-dim)] hover:text-[color:var(--accent)]">
        {abierto ? 'Ocultar' : 'Ver'} sus {miembro.numCredenciales} passkey{miembro.numCredenciales === 1 ? '' : 's'}
      </button>
      {abierto && (
        <div className="mt-1.5 space-y-1.5 border-l-2 border-[color:var(--border)] pl-2">
          {cargando && <p className="text-[color:var(--text-dim)]">Cargando…</p>}
          {error && <p className="text-[color:var(--bad)]">{error}</p>}
          {credenciales?.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <span className="text-[color:var(--text-dim)]">
                {etiquetaTransporte(c.transports)} · creada {formatearRelativo(c.creadoEn)}
              </span>
              <button
                onClick={() => revocar(c.id)}
                disabled={revocandoId === c.id}
                className="text-[color:var(--bad)] flex-shrink-0"
              >
                {revocandoId === c.id ? 'Revocando…' : 'Revocar'}
              </button>
            </div>
          ))}
          {credenciales?.length === 0 && <p className="text-[color:var(--text-dim)]">Ya no le queda ninguna.</p>}
        </div>
      )}
    </div>
  );
}

function EnlaceInvitacion({ link, onCerrar }: { link: string; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="rounded-xl border border-[color:var(--accent)] bg-[color:var(--surface-2)] p-4 space-y-2">
      <p className="text-sm">
        Comparte este enlace de un solo uso para que registre su passkey:
      </p>
      <div className="flex gap-2">
        <input readOnly value={link} className="flex-1 rounded-lg bg-[color:var(--surface)] px-2 py-1.5 text-xs" />
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              // Algunos navegadores/contextos no dejan usar el portapapeles
              // así -- el enlace de todas formas sigue visible en el campo
              // de texto para copiarlo a mano.
            }
          }}
          className="text-xs px-3 py-1.5 rounded-lg border border-[color:var(--border)] active:scale-95 transition-transform"
        >
          {copiado ? 'Copiado ✓' : 'Copiar'}
        </button>
      </div>
      <button onClick={onCerrar} className="text-xs text-[color:var(--text-dim)] active:scale-95 transition-transform">
        Listo
      </button>
    </div>
  );
}

// Campo de presupuesto de un miembro, con un botón "Guardar" explícito --
// antes se guardaba solo al salir del campo (onBlur), lo que era fácil de
// confundir con "no se guardó nada" si la persona no notaba el cambio.
function CampoPresupuesto({
  nombre,
  monto,
  onGuardar,
}: {
  nombre: string;
  monto: number | undefined;
  onGuardar: (monto: number) => Promise<void>;
}) {
  const [valor, setValor] = useState(monto !== undefined ? String(monto) : '');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setValor(monto !== undefined ? String(monto) : '');
  }, [monto]);

  async function guardar() {
    const nuevoMonto = Number(valor);
    if (!valor.trim() || Number.isNaN(nuevoMonto) || nuevoMonto < 0) {
      setError('Monto inválido');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await onGuardar(nuevoMonto);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 1500);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          placeholder={`$ para ${nombre.split(' ')[0]}`}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') guardar();
          }}
          className="w-24 rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--border)] px-2 py-1.5 text-xs"
        />
        <button
          onClick={guardar}
          disabled={guardando}
          className="btn-primary rounded-lg px-2 py-1.5 text-xs flex-shrink-0 disabled:opacity-60 active:scale-95 transition-transform"
        >
          {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : 'Guardar'}
        </button>
      </div>
      {error && <p className="text-[10px] text-[color:var(--bad)] mt-1">{error}</p>}
    </div>
  );
}

export function Admin() {
  const { miembro: yo, salir } = useAuth();
  const periodo = periodoActualISO();
  const [casas, setCasas] = useState<Casa[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [presupuestos, setPresupuestos] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [enlacePendiente, setEnlacePendiente] = useState<{ miembroId: string; link: string } | null>(null);

  const [nombreMiembro, setNombreMiembro] = useState('');
  const [casaIdsMiembro, setCasaIdsMiembro] = useState<string[]>([]);
  const [todasLasCasasMiembro, setTodasLasCasasMiembro] = useState(false);
  const [dandoDeAlta, setDandoDeAlta] = useState(false);
  const [borrandoMiembroId, setBorrandoMiembroId] = useState<string | null>(null);
  const [generandoEnlaceId, setGenerandoEnlaceId] = useState<string | null>(null);

  async function cargar() {
    const [c, cat, m, p] = await Promise.all([listarCasas(), listarCategorias(), listarMiembros(), obtenerPresupuestos(periodo)]);
    setCasas(c);
    setCategorias(cat);
    setMiembros(m);
    setPresupuestos(Object.fromEntries(p.map((x) => [x.miembroId, x.monto])));
  }

  useEffect(() => {
    cargar().catch((err) => setError(mensajeDeError(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function altaMiembro(e: FormEvent) {
    e.preventDefault();
    if (!nombreMiembro.trim()) return;
    setDandoDeAlta(true);
    try {
      const { miembro, invitacion } = await crearMiembro({
        nombre: nombreMiembro.trim(),
        casaIds: casaIdsMiembro,
        todasLasCasas: todasLasCasasMiembro,
      });
      setNombreMiembro('');
      setCasaIdsMiembro([]);
      setTodasLasCasasMiembro(false);
      await cargar();
      // El enlace se muestra junto a este mismo miembro más abajo, en su
      // fila de la lista (no aquí arriba) -- así siempre aparece justo
      // donde se generó, sea que se acabe de dar de alta o que se haya
      // pedido para alguien que ya existía.
      setEnlacePendiente({ miembroId: miembro.id, link: `${window.location.origin}${invitacion.ruta}` });
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setDandoDeAlta(false);
    }
  }

  async function generarEnlace(m: Miembro) {
    // Ya tiene una passkey: esto NO la reemplaza, solo agrega una nueva
    // (por ejemplo si perdió el teléfono donde tenía registrada la suya, o
    // quiere entrar también desde otro dispositivo). Sin esto, perder el
    // teléfono lo dejaba fuera para siempre.
    if (m.tienePasskey) {
      const confirmado = window.confirm(
        `"${m.nombre}" ya tiene una passkey registrada. Esto genera un enlace para agregar OTRA (por ejemplo si perdió su dispositivo) -- no borra la que ya tiene. ¿Generar de todas formas?`
      );
      if (!confirmado) return;
    }
    setGenerandoEnlaceId(m.id);
    try {
      const { invitacion } = await regenerarInvitacion(m.id);
      setEnlacePendiente({ miembroId: m.id, link: `${window.location.origin}${invitacion.ruta}` });
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGenerandoEnlaceId(null);
    }
  }

  async function borrarMiembroConfirmado(m: Miembro) {
    const esUnoMismo = m.id === yo?.id;
    const detalleGastos = m.numGastos > 0 ? ` y sus ${m.numGastos} gasto(s) registrado(s) también se borran` : '';
    const mensaje = esUnoMismo
      ? `¿Borrarte a ti mismo ("${m.nombre}")? Vas a perder tu acceso de inmediato${detalleGastos}. Esto no se puede deshacer.`
      : `¿Borrar a "${m.nombre}"? Pierde su acceso (passkey)${detalleGastos}. Esto no se puede deshacer.`;
    if (!window.confirm(mensaje)) return;
    setBorrandoMiembroId(m.id);
    try {
      await borrarMiembro(m.id);
      if (esUnoMismo) {
        // Ya no existe: seguir "logueado" del lado del cliente solo
        // confundiría (cualquier otra petición va a regresar 401 de todas
        // formas). Se cierra la sesión de una vez y se manda a la pantalla
        // de entrada.
        await salir();
        return;
      }
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setBorrandoMiembroId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="heading text-xl font-semibold">Administración</h1>
      {error && <p className="text-sm text-[color:var(--bad)]">{error}</p>}

      <section className="glass rounded-2xl p-5 space-y-4">
        <h2 className="heading text-base font-semibold">Casas</h2>
        <ul className="divide-y divide-[color:var(--border)]">
          {casas.map((c) => (
            <FilaCatalogo
              key={c.id}
              item={c}
              onRenombrar={async (nombre) => {
                try {
                  await editarCasa(c.id, { nombre });
                  await cargar();
                } catch (err) {
                  setError(mensajeDeError(err));
                }
              }}
              onBorrar={async () => {
                try {
                  await borrarCasa(c.id);
                  await cargar();
                } catch (err) {
                  setError(mensajeDeError(err));
                }
              }}
            />
          ))}
          {casas.length === 0 && <li className="text-sm text-[color:var(--text-dim)] py-1">Todavía no hay casas.</li>}
        </ul>
        <CampoNuevo
          placeholder="Nombre de la nueva casa"
          onCrear={async (nombre) => {
            await crearCasa(nombre);
            await cargar();
          }}
        />
      </section>

      <section className="glass rounded-2xl p-5 space-y-4">
        <h2 className="heading text-base font-semibold">Categorías de gasto</h2>
        <ul className="divide-y divide-[color:var(--border)]">
          {categorias.map((c) => (
            <FilaCatalogo
              key={c.id}
              item={c}
              onRenombrar={async (nombre) => {
                try {
                  await editarCategoria(c.id, { nombre });
                  await cargar();
                } catch (err) {
                  setError(mensajeDeError(err));
                }
              }}
              onBorrar={async () => {
                try {
                  await borrarCategoria(c.id);
                  await cargar();
                } catch (err) {
                  setError(mensajeDeError(err));
                }
              }}
            />
          ))}
          {categorias.length === 0 && <li className="text-sm text-[color:var(--text-dim)] py-1">Todavía no hay categorías.</li>}
        </ul>
        <CampoNuevo
          placeholder="Nombre de la nueva categoría"
          onCrear={async (nombre) => {
            await crearCategoria(nombre);
            await cargar();
          }}
        />
      </section>

      <section className="glass rounded-2xl p-5 space-y-4">
        <h2 className="heading text-base font-semibold">Dar de alta a un miembro</h2>
        <form onSubmit={altaMiembro} className="flex flex-col sm:flex-row sm:items-start gap-2">
          <input
            value={nombreMiembro}
            onChange={(e) => setNombreMiembro(e.target.value)}
            placeholder="Nombre"
            className="flex-1 rounded-xl bg-[color:var(--surface-2)] border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
          />
          <div className="rounded-xl border border-[color:var(--border)] px-3 py-2">
            <SelectorCasas
              casas={casas}
              casaIds={casaIdsMiembro}
              todasLasCasas={todasLasCasasMiembro}
              onCambiar={(ids, todas) => {
                setCasaIdsMiembro(ids);
                setTodasLasCasasMiembro(todas);
              }}
            />
          </div>
          <button
            disabled={dandoDeAlta}
            className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-60 active:scale-95 transition-transform"
          >
            {dandoDeAlta ? 'Dando de alta…' : 'Dar de alta'}
          </button>
        </form>
        <p className="text-xs text-[color:var(--text-dim)]">
          Su enlace de invitación aparece junto a su nombre, más abajo en "Presupuesto individual de cada miembro".
        </p>
      </section>

      <section className="glass rounded-2xl p-5 space-y-4">
        <h2 className="heading text-base font-semibold">Presupuesto individual de cada miembro · {periodo}</h2>
        <p className="text-xs text-[color:var(--text-dim)] -mt-2">
          El presupuesto es de la persona, no de la casa: cada quien tiene el suyo, sin importar en qué casa viva o
          gaste. La casa aquí solo indica dónde vive cada quien.
        </p>
        <div className="space-y-3">
          {miembros.map((m) => (
            <div key={m.id} className="flex flex-wrap items-end gap-3 border-b border-[color:var(--border)] pb-3 last:border-0 last:pb-0">
              <div className="min-w-[10rem] flex-1">
                <NombreMiembro
                  miembro={m}
                  onRenombrar={async (nombre) => {
                    try {
                      await editarMiembro(m.id, { nombre });
                      await cargar();
                    } catch (err) {
                      setError(mensajeDeError(err));
                    }
                  }}
                />
                <div className="text-xs text-[color:var(--text-dim)]">
                  {m.todasLasCasas ? 'Todas las casas' : m.casaNombres.length > 0 ? m.casaNombres.join(', ') : 'Sin casa'} ·{' '}
                  {m.rol === 'admin' ? 'Administrador' : 'Miembro'}
                  {m.numGastos > 0 && ` · ${m.numGastos} gasto${m.numGastos === 1 ? '' : 's'}`}
                </div>
                <div className="mt-1">
                  <PasskeysDeMiembro miembro={m} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wide text-[color:var(--text-dim)] mb-0.5">
                  Rol
                </label>
                <select
                  value={m.rol}
                  onChange={async (e) => {
                    try {
                      await editarMiembro(m.id, { rol: e.target.value as Rol });
                      await cargar();
                    } catch (err) {
                      setError(mensajeDeError(err));
                    }
                  }}
                  className="rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--border)] px-2 py-1.5 text-xs"
                >
                  <option value="miembro">Miembro</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wide text-[color:var(--text-dim)] mb-0.5">Casas</label>
                <SelectorCasas
                  casas={casas}
                  casaIds={m.casaIds}
                  todasLasCasas={m.todasLasCasas}
                  onCambiar={async (casaIds, todasLasCasas) => {
                    try {
                      await editarMiembro(m.id, { casaIds, todasLasCasas });
                      await cargar();
                    } catch (err) {
                      setError(mensajeDeError(err));
                    }
                  }}
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wide text-[color:var(--text-dim)] mb-0.5">
                  Su presupuesto mensual
                </label>
                {m.rol === 'admin' ? (
                  <p className="text-xs text-[color:var(--text-dim)] w-32">— (el administrador no tiene presupuesto)</p>
                ) : (
                  <div className="space-y-1">
                    <label className="flex items-center gap-1.5 text-[10px] text-[color:var(--text-dim)]">
                      <input
                        type="checkbox"
                        checked={m.sinPresupuesto}
                        onChange={async (e) => {
                          try {
                            await editarMiembro(m.id, { sinPresupuesto: e.target.checked });
                            await cargar();
                          } catch (err) {
                            setError(mensajeDeError(err));
                          }
                        }}
                      />
                      Sin presupuesto
                    </label>
                    {m.sinPresupuesto ? (
                      <p className="text-xs text-[color:var(--text-dim)]">— (no entra en gráficas ni reportes)</p>
                    ) : (
                      <CampoPresupuesto
                        nombre={m.nombre}
                        monto={presupuestos[m.id]}
                        onGuardar={async (monto) => {
                          await asignarPresupuesto(m.id, periodo, monto);
                          await cargar();
                        }}
                      />
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => generarEnlace(m)}
                disabled={generandoEnlaceId === m.id}
                className="text-xs px-2 py-1.5 rounded-lg border border-[color:var(--border)] text-[color:var(--text-dim)] disabled:opacity-60 active:scale-95 transition-transform"
              >
                {generandoEnlaceId === m.id ? 'Generando…' : m.tienePasskey ? 'Agregar otra passkey' : 'Generar enlace'}
              </button>

              <button
                onClick={() => borrarMiembroConfirmado(m)}
                disabled={borrandoMiembroId === m.id}
                className="text-xs px-2 py-1.5 rounded-lg border border-[color:var(--border)] text-[color:var(--text-dim)] hover:text-[color:var(--bad)] disabled:opacity-60"
              >
                {borrandoMiembroId === m.id ? 'Borrando…' : 'Borrar'}
              </button>

              {enlacePendiente?.miembroId === m.id && (
                <div className="w-full">
                  <EnlaceInvitacion link={enlacePendiente.link} onCerrar={() => setEnlacePendiente(null)} />
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-[color:var(--text-dim)]">
          El presupuesto se guarda al salir del campo. Suma actual asignada entre todos los miembros:{' '}
          {formatMoney(Object.values(presupuestos).reduce((s, v) => s + v, 0))}. El gasto total por casa que se ve en
          Reportes es solo de referencia — no tiene su propio límite.
        </p>
      </section>
    </div>
  );
}
