import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth, mensajeDeError } from '../lib/auth';

export function Invitacion() {
  const { token } = useParams<{ token: string }>();
  const { registrarConInvitacion } = useAuth();
  const [datos, setDatos] = useState<{ nombre: string; casaNombre: string | null } | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ nombre: string; casaNombre: string | null }>(`/api/auth/invitacion/${token}`)
      .then(setDatos)
      .catch((err) => setError(mensajeDeError(err)));
  }, [token]);

  async function registrar() {
    if (!token) return;
    setCargando(true);
    setError('');
    try {
      await registrarConInvitacion(token);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass rounded-3xl p-8 max-w-md w-full text-center animate-in">
        <h1 className="heading text-2xl font-semibold gradient-text mb-2">Control Familiar</h1>
        {!datos && !error && <p className="text-[color:var(--text-dim)]">Cargando invitación…</p>}
        {error && <p className="text-sm text-[color:var(--bad)] mb-4">{error}</p>}
        {datos && (
          <>
            <p className="text-[color:var(--text-dim)] mb-6">
              Hola <span className="text-[color:var(--text)] font-medium">{datos.nombre}</span>, te dieron de alta
              {datos.casaNombre ? (
                <>
                  {' '}
                  en <span className="text-[color:var(--text)] font-medium">{datos.casaNombre}</span>
                </>
              ) : null}
              . Registra tu passkey para entrar (Face ID, huella o llave de seguridad).
            </p>
            <button onClick={registrar} disabled={cargando} className="btn-primary w-full rounded-xl py-3">
              {cargando ? 'Un momento…' : 'Registrar mi passkey'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
