import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { api, ApiError, enSesionExpirada, marcarInteraccion, type Miembro } from './api';

// Cierre de sesión por inactividad: si nadie toca el dispositivo (clic,
// tecla, touch, scroll) durante este tiempo, se sale automáticamente y hay
// que volver a entrar con la passkey. Pensado para un dispositivo
// compartido de la familia que se queda solo sobre la mesa.
const INACTIVIDAD_MS = 30_000;
// No se avisa al servidor en cada evento (mousemove dispara demasiado
// seguido) -- basta con avisar bastante más seguido que INACTIVIDAD_MS
// para que el candado del backend (misma ventana de 30s) nunca se adelante.
const AVISO_MINIMO_MS = 10_000;

type AuthContextType = {
  miembro: Miembro | null;
  cargando: boolean;
  registrarComoAdmin: (nombre: string) => Promise<void>;
  registrarConInvitacion: (token: string) => Promise<void>;
  entrarConPasskey: () => Promise<void>;
  salir: () => Promise<void>;
  refrescar: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [miembro, setMiembro] = useState<Miembro | null>(null);
  const [cargando, setCargando] = useState(true);

  async function refrescar() {
    try {
      const r = await api.get<{ miembro: Miembro }>('/api/auth/me');
      setMiembro(r.miembro);
    } catch {
      setMiembro(null);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    refrescar();
  }, []);

  // Si cualquier llamada a la API regresa 401 (por ejemplo, porque el
  // backend ya cerró la sesión por inactividad), se refleja de inmediato
  // aquí -- así no hace falta esperar a que esta pestaña en particular haga
  // su propia revisión para volver a la pantalla de passkey.
  useEffect(() => {
    enSesionExpirada(() => setMiembro(null));
    return () => enSesionExpirada(null);
  }, []);

  // Reloj de inactividad: mientras haya sesión, cualquier interacción real
  // (clic, tecla, touch, scroll) reinicia la cuenta regresiva de 30s; si se
  // llega a cero sin ninguna, se cierra la sesión sola. Además, avisa al
  // backend (con límite de una vez cada AVISO_MINIMO_MS) para que su propio
  // candado -- el que de verdad importa, porque también aplica si se
  // recarga la página o el navegador reanuda la pestaña después -- vea la
  // misma interacción.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoAviso = useRef(0);
  useEffect(() => {
    if (!miembro) return;

    function registrarActividad() {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        salir();
      }, INACTIVIDAD_MS);

      const ahora = Date.now();
      if (ahora - ultimoAviso.current >= AVISO_MINIMO_MS) {
        ultimoAviso.current = ahora;
        marcarInteraccion().catch(() => {});
      }
    }

    const eventos: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    eventos.forEach((e) => window.addEventListener(e, registrarActividad, { passive: true }));
    registrarActividad(); // arranca la cuenta regresiva al entrar

    return () => {
      eventos.forEach((e) => window.removeEventListener(e, registrarActividad));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miembro?.id]);

  async function registrarComoAdmin(nombre: string) {
    const { options, miembroId } = await api.post<{ options: any; miembroId: string }>('/api/auth/bootstrap/opciones', { nombre });
    const respuesta = await startRegistration({ optionsJSON: options });
    const r = await api.post<{ ok: true; miembro: Miembro }>('/api/auth/bootstrap/verificar', { miembroId, response: respuesta });
    setMiembro(r.miembro);
  }

  async function registrarConInvitacion(token: string) {
    const { options, miembroId } = await api.post<{ options: any; miembroId: string }>(`/api/auth/invitacion/${token}/opciones`);
    const respuesta = await startRegistration({ optionsJSON: options });
    const r = await api.post<{ ok: true; miembro: Miembro }>(`/api/auth/invitacion/${token}/verificar`, {
      miembroId,
      response: respuesta,
    });
    setMiembro(r.miembro);
  }

  async function entrarConPasskey() {
    const { options, requestId } = await api.post<{ options: any; requestId: string }>('/api/auth/login/opciones', {});
    const respuesta = await startAuthentication({ optionsJSON: options });
    const r = await api.post<{ ok: true; miembro: Miembro }>('/api/auth/login/verificar', { requestId, response: respuesta });
    setMiembro(r.miembro);
  }

  async function salir() {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setMiembro(null);
    }
  }

  return (
    <AuthContext.Provider value={{ miembro, cargando, registrarComoAdmin, registrarConInvitacion, entrarConPasskey, salir, refrescar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

export function mensajeDeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) {
    if (err.name === 'NotAllowedError') return 'Se canceló o no se completó la verificación de la passkey.';
    return err.message;
  }
  return 'Ocurrió un error inesperado';
}
