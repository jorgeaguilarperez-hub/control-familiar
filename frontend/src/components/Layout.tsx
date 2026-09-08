import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';

const LINKS = [
  { to: '/', label: 'Inicio', fin: true },
  { to: '/reportes', label: 'Reportes' },
  { to: '/familia', label: 'Familia' },
];

export function Layout() {
  const { miembro, salir } = useAuth();

  // "Latido" de presencia: cada petición autenticada ya marca actividad en
  // el backend, así que basta con pedir /api/auth/me cada rato mientras la
  // pestaña esté abierta -- sin necesidad de websockets.
  useEffect(() => {
    const id = setInterval(() => {
      api.get('/api/auth/me').catch(() => {});
    }, 45_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="glass sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <div className="heading font-semibold gradient-text text-lg">Control Familiar</div>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.fin}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive ? 'bg-[color:var(--surface-2)] text-[color:var(--text)]' : 'text-[color:var(--text-dim)]'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
          {miembro?.rol === 'admin' && (
            <>
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    isActive ? 'bg-[color:var(--surface-2)] text-[color:var(--text)]' : 'text-[color:var(--text-dim)]'
                  }`
                }
              >
                Admin
              </NavLink>
              <NavLink
                to="/bitacora"
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    isActive ? 'bg-[color:var(--surface-2)] text-[color:var(--text)]' : 'text-[color:var(--text-dim)]'
                  }`
                }
              >
                Bitácora
              </NavLink>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-[color:var(--text-dim)]">{miembro?.nombre}</span>
          <button onClick={() => salir()} className="text-sm text-[color:var(--text-dim)] hover:text-[color:var(--text)]">
            Salir
          </button>
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
