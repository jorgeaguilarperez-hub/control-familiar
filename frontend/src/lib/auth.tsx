import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { api, ApiError, type Miembro } from './api';

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
