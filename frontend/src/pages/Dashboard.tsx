import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listarCasas,
  listarCategorias,
  crearCategoria,
  listarGastos,
  crearGasto,
  editarGasto,
  borrarGasto,
  obtenerResumen,
  type Casa,
  type Categoria,
  type Gasto,
  type ResumenMiembro,
} from '../lib/api';
import { useAuth, mensajeDeError } from '../lib/auth';
import { periodoActualISO, formatMoney, formatDate } from '../lib/format';
import { BudgetBar } from '../components/BudgetBar';
import { GastoForm } from '../components/GastoForm';

export function Dashboard() {
  const { miembro } = useAuth();
  const periodo = periodoActualISO();
  const [casas, setCasas] = useState<Casa[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [misGastos, setMisGastos] = useState<Gasto[]>([]);
  const [miResumen, setMiResumen] = useState<ResumenMiembro | null>(null);
  const [editando, setEditando] = useState<Gasto | null>(null);
  const [error, setError] = useState('');
  const [cargado, setCargado] = useState(false);

  async function cargar() {
    const [c, cat, gastos, resumen] = await Promise.all([
      listarCasas(),
      listarCategorias(),
      listarGastos({ periodo, miembroId: miembro?.id }),
      obtenerResumen(periodo),
    ]);
    setCasas(c);
    setCategorias(cat);
    setMisGastos(gastos);
    setMiResumen(resumen.porMiembro.find((m) => m.miembroId === miembro?.id) || null);
    setCargado(true);
  }

  useEffect(() => {
    cargar().catch((err) => setError(mensajeDeError(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!cargado) return <p className="text-[color:var(--text-dim)]">Cargando…</p>;

  // El administrador es un rol solo para administrar el sistema: no tiene
  // presupuesto propio ni registra gastos, así que este panel (que es
  // justo eso) no le aplica -- se le manda a lo que sí puede hacer.
  if (miembro?.rol === 'admin') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="heading text-xl font-semibold mb-1">Hola, {miembro?.nombre?.split(' ')[0]}</h1>
          <p className="text-sm text-[color:var(--text-dim)]">
            Como administrador no tienes presupuesto ni gastos propios -- ese panel es para los demás miembros de la
            familia.
          </p>
        </div>
        <div className="glass rounded-2xl p-6 space-y-2">
          <p className="text-sm text-[color:var(--text-dim)]">
            Desde aquí administras casas, categorías, miembros y sus presupuestos.
          </p>
          <div className="flex gap-3 pt-1">
            <Link to="/admin" className="btn-primary rounded-xl px-4 py-2 text-sm">
              Ir a Admin
            </Link>
            <Link to="/reportes" className="rounded-xl px-4 py-2 text-sm border border-[color:var(--border)] text-[color:var(--text-dim)]">
              Ver reportes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (casas.length === 0 || categorias.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 text-center">
        <p className="text-[color:var(--text-dim)]">
          {casas.length === 0 ? 'Todavía no hay casas.' : 'Todavía no hay categorías de gasto.'} Pídele al administrador que
          las cree desde el panel de Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading text-xl font-semibold mb-1">Hola, {miembro?.nombre?.split(' ')[0]}</h1>
        <p className="text-sm text-[color:var(--text-dim)]">Tu presupuesto de este mes</p>
      </div>

      <div className="glass rounded-2xl p-5">
        <BudgetBar gastado={miResumen?.gastado ?? 0} presupuesto={miResumen?.presupuesto ?? null} estado={miResumen?.estado ?? 'ok'} />
      </div>

      <div className="glass rounded-2xl p-5">
        <h2 className="heading text-base font-semibold mb-4">{editando ? 'Editar gasto' : 'Agregar gasto'}</h2>
        {error && <p className="text-sm text-[color:var(--bad)] mb-3">{error}</p>}
        <GastoForm
          casas={casas}
          categorias={categorias}
          casaInicial={miembro?.casaIds?.[0]}
          gastoAEditar={editando || undefined}
          onCancelar={editando ? () => setEditando(null) : undefined}
          onNuevaCategoria={async (nombre) => {
            const categoria = await crearCategoria(nombre);
            await cargar();
            return categoria;
          }}
          onGuardar={async (datos) => {
            if (editando) {
              await editarGasto(editando.id, datos);
              setEditando(null);
            } else {
              await crearGasto(datos);
            }
            await cargar();
          }}
        />
      </div>

      <div className="glass rounded-2xl p-5">
        <h2 className="heading text-base font-semibold mb-3">Tus gastos de este mes</h2>
        {misGastos.length === 0 ? (
          <p className="text-sm text-[color:var(--text-dim)]">Todavía no has registrado gastos este mes.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {misGastos.map((g) => (
              <li key={g.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {g.categoriaNombre} · {g.casaNombre}
                  </div>
                  <div className="text-xs text-[color:var(--text-dim)] truncate">
                    {formatDate(g.fecha)}
                    {g.nota ? ` · ${g.nota}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-semibold">{formatMoney(g.monto)}</span>
                  <button
                    onClick={() => setEditando(g)}
                    className="text-xs text-[color:var(--text-dim)] hover:text-[color:var(--accent)]"
                  >
                    Editar
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await borrarGasto(g.id);
                        await cargar();
                      } catch (err) {
                        setError(mensajeDeError(err));
                      }
                    }}
                    className="text-xs text-[color:var(--text-dim)] hover:text-[color:var(--bad)]"
                  >
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
