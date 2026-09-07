import { useState } from 'react';
import { useAuth, mensajeDeError } from '../lib/auth';

export function Login({ onFallo }: { onFallo?: () => void }) {
  const { entrarConPasskey } = useAuth();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function entrar() {
    setCargando(true);
    setError('');
    try {
      await entrarConPasskey();
    } catch (err) {
      setError(mensajeDeError(err));
      // Un intento fallido (por ejemplo "esta passkey no está registrada
      // aquí") es la señal de que vale la pena revisar si la familia se
      // quedó sin nadie registrado -- si es así, el padre (Portada) cambia
      // automáticamente a la pantalla de "quiero ser el administrador".
      onFallo?.();
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass rounded-3xl p-8 max-w-md w-full text-center animate-in">
        <h1 className="heading text-2xl font-semibold gradient-text mb-2">Control Familiar</h1>
        <p className="text-[color:var(--text-dim)] mb-6">Entra con tu passkey (Face ID, huella o llave de seguridad).</p>
        {error && <p className="text-sm text-[color:var(--bad)] mb-4">{error}</p>}
        <button onClick={entrar} disabled={cargando} className="btn-primary w-full rounded-xl py-3">
          {cargando ? 'Un momento…' : 'Entrar con mi passkey'}
        </button>
        <p className="text-xs text-[color:var(--text-dim)] mt-5">
          ¿Eres nuevo en la familia? Pídele al administrador que te comparta tu enlace de invitación.
        </p>
      </div>
    </div>
  );
}
