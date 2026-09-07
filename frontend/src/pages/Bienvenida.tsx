import { useState } from 'react';
import { useAuth, mensajeDeError } from '../lib/auth';

export function Bienvenida() {
  const { registrarComoAdmin } = useAuth();
  const [paso, setPaso] = useState<'inicio' | 'nombre'>('inicio');
  const [nombre, setNombre] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function confirmar() {
    if (!nombre.trim()) {
      setError('Escribe tu nombre');
      return;
    }
    setCargando(true);
    setError('');
    try {
      await registrarComoAdmin(nombre.trim());
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass rounded-3xl p-8 max-w-md w-full animate-in">
        <h1 className="heading text-2xl font-semibold gradient-text mb-2">Control Familiar</h1>
        {paso === 'inicio' ? (
          <>
            <p className="text-[color:var(--text-dim)] mb-6">
              Todavía no hay nadie registrado en este sistema. Como primera persona en entrar, puedes fundarlo como
              administrador: podrás dar de alta a los demás miembros de la familia, crear las casas y asignar los
              presupuestos.
            </p>
            <button onClick={() => setPaso('nombre')} className="btn-primary w-full rounded-xl py-3">
              Quiero ser el administrador
            </button>
          </>
        ) : (
          <>
            <p className="text-[color:var(--text-dim)] mb-4">¿Cómo te llamas? Con esto vas a registrar tu passkey.</p>
            <input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmar()}
              placeholder="Tu nombre"
              className="w-full rounded-xl bg-[color:var(--surface-2)] border border-[color:var(--border)] px-4 py-3 mb-4 outline-none focus:border-[color:var(--accent)]"
            />
            {error && <p className="text-sm text-[color:var(--bad)] mb-3">{error}</p>}
            <button onClick={confirmar} disabled={cargando} className="btn-primary w-full rounded-xl py-3">
              {cargando ? 'Un momento…' : 'Registrar mi passkey'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
