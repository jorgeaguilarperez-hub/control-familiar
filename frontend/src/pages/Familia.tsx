import { useEffect, useState } from 'react';
import { listarMiembros, type Miembro } from '../lib/api';
import { PresenceDot } from '../components/PresenceDot';
import { mensajeDeError } from '../lib/auth';

export function Familia() {
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    listarMiembros()
      .then(setMiembros)
      .catch((err) => setError(mensajeDeError(err)));
  }, []);

  const enLinea = miembros.filter((m) => m.enLinea).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading text-xl font-semibold mb-1">Familia</h1>
        <p className="text-sm text-[color:var(--text-dim)]">
          {enLinea > 0 ? `${enLinea} en línea ahora` : 'Nadie en línea ahora mismo'}
        </p>
      </div>

      {error && <p className="text-sm text-[color:var(--bad)]">{error}</p>}

      <div className="glass rounded-2xl divide-y divide-[color:var(--border)]">
        {miembros.map((m) => (
          <div key={m.id} className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <PresenceDot enLinea={m.enLinea} />
              <div className="min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {m.nombre}
                  {m.rol === 'admin' && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[color:var(--surface-2)] text-[color:var(--accent-2)]">
                      Admin
                    </span>
                  )}
                  {!m.activo && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[color:var(--surface-2)] text-[color:var(--text-dim)]">
                      Inactivo
                    </span>
                  )}
                </div>
                <div className="text-xs text-[color:var(--text-dim)] truncate">
                  {m.todasLasCasas ? 'Todas las casas' : m.casaNombres.length > 0 ? m.casaNombres.join(', ') : 'Sin casa asignada'}
                  {!m.tienePasskey && ' · aún no registra su passkey'}
                </div>
              </div>
            </div>
            <span className="text-xs text-[color:var(--text-dim)] flex-shrink-0">{m.enLinea ? 'En línea' : ''}</span>
          </div>
        ))}
        {miembros.length === 0 && <p className="p-4 text-sm text-[color:var(--text-dim)]">Todavía no hay miembros.</p>}
      </div>
    </div>
  );
}
