import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { obtenerEstado } from './lib/api';
import { Bienvenida } from './pages/Bienvenida';
import { Login } from './pages/Login';
import { Invitacion } from './pages/Invitacion';
import { Dashboard } from './pages/Dashboard';
import { Reportes } from './pages/Reportes';
import { Familia } from './pages/Familia';
import { Admin } from './pages/Admin';
import { Bitacora } from './pages/Bitacora';
import { Layout } from './components/Layout';

function Portada() {
  const [hayMiembros, setHayMiembros] = useState<boolean | null>(null);

  async function verificarEstado() {
    try {
      const r = await obtenerEstado();
      setHayMiembros(r.hayMiembros);
    } catch {
      setHayMiembros(true);
    }
  }

  useEffect(() => {
    verificarEstado();
  }, []);

  if (hayMiembros === null) return null;
  // Si ya no queda nadie registrado (por ejemplo, alguien borró a todos los
  // miembros incluyendo al administrador), hay que volver a ofrecer "quiero
  // ser el administrador" en vez de quedarse pidiendo una passkey que ya no
  // existe. Como esta pantalla no vuelve a consultar el estado por su
  // cuenta, cada intento de login fallido dispara una revisión (por si el
  // fallo fue justo porque la familia se quedó vacía).
  return hayMiembros ? <Login onFallo={verificarEstado} /> : <Bienvenida />;
}

function Privado({ children }: { children: React.ReactNode }) {
  const { miembro, cargando } = useAuth();
  if (cargando) return null;
  if (!miembro) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SoloAdmin({ children }: { children: React.ReactNode }) {
  const { miembro } = useAuth();
  if (miembro?.rol !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Rutas() {
  const { miembro, cargando } = useAuth();
  if (cargando) return null;

  if (!miembro) {
    return (
      <Routes>
        <Route path="/invitacion/:token" element={<Invitacion />} />
        <Route path="*" element={<Portada />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          path="/"
          element={
            <Privado>
              <Dashboard />
            </Privado>
          }
        />
        <Route
          path="/reportes"
          element={
            <Privado>
              <Reportes />
            </Privado>
          }
        />
        <Route
          path="/familia"
          element={
            <Privado>
              <Familia />
            </Privado>
          }
        />
        <Route
          path="/admin"
          element={
            <Privado>
              <SoloAdmin>
                <Admin />
              </SoloAdmin>
            </Privado>
          }
        />
        <Route
          path="/bitacora"
          element={
            <Privado>
              <SoloAdmin>
                <Bitacora />
              </SoloAdmin>
            </Privado>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Rutas />
      </AuthProvider>
    </BrowserRouter>
  );
}
