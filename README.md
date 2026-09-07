# Control Familiar

Sistema web para que la familia lleve el control de gastos entre varias casas y varios miembros, con presupuesto por
persona, alertas al acercarse al límite y reportes con gráficas de barras y circulares. Acceso solo por passkey
(sin contraseñas), igual que en Control Autos.

## Qué incluye

- **Backend** (`backend/`): API en Node.js + TypeScript + Fastify. Base de datos SQLite real con el módulo nativo
  `node:sqlite` (no requiere instalar ni descargar nada aparte). Login con passkeys (WebAuthn) vía `@simplewebauthn`.
- **Frontend** (`frontend/`): React + Vite + Tailwind. Dashboard con captura rápida de gasto y barra de presupuesto,
  Reportes con gráficas de barras (gasto por casa) y circular (gasto por categoría), Familia con presencia en línea,
  y un panel de Admin para casas, categorías, miembros y presupuestos.
- **Autenticación**: la primera persona que entra funda el sistema como administrador. El administrador da de alta a
  cada nuevo miembro y le comparte un enlace único de un solo uso; esa persona lo abre y registra su propia passkey.
- Suite de pruebas automatizada (`npm test` en `backend/`) que valida login, permisos y el cálculo de presupuestos y
  alertas — sin tocar datos reales.

## Primera vez: cómo arrancarlo

Necesitas dos terminales abiertas (una para el backend, otra para el frontend). Node.js 22 o superior ya debe estar
instalado en tu Mac (con `node --version` puedes confirmarlo).

**Terminal 1 — backend:**

```bash
cd ~/Documents/Proyectos/ControlFamiliar/backend
npm install        # solo la primera vez
npm run dev
```

Debe decir `Control Familiar backend escuchando en http://localhost:4000`.

**Terminal 2 — frontend:**

```bash
cd ~/Documents/Proyectos/ControlFamiliar/frontend
npm install        # solo la primera vez
npm run dev
```

Abre `http://localhost:5173` en tu navegador (o desde el celular, usando la IP de tu Mac en la misma red WiFi, ya que
las passkeys funcionan en `localhost` para pruebas, pero para usarlo desde el celular vas a necesitar HTTPS real —
eso llega con la Fase 2 en Render).

La primera vez que entres verás la pantalla de bienvenida para fundar el sistema como administrador. Desde ahí:

1. Registra tu passkey como administrador.
2. Ve a **Admin** y crea las casas y, si quieres, ajusta las categorías de gasto.
3. Da de alta a cada miembro de la familia (nombre + casa) — el sistema te da un enlace único para compartirle.
4. Asigna el presupuesto mensual de cada quien desde la misma pantalla de Admin.

## Comandos útiles

```bash
cd backend
npm run dev     # arranca el servidor en modo desarrollo (recarga sola al guardar)
npm test        # corre la suite de pruebas automatizada
npm run build   # compila a JavaScript (dist/) para producción

cd frontend
npm run dev     # arranca el frontend en modo desarrollo
npm run build   # genera frontend/dist listo para producción
```

En producción (Render), el backend sirve el `frontend/dist` ya compilado desde el mismo dominio — no hacen falta dos
procesos ni dos puertos.

## Fase 2: desplegar en Render

Mismo patrón que usaste en Control Autos:

1. Sube este proyecto a un repositorio de Git.
2. En Render, crea un **Web Service** desde ese repositorio (puedes adaptar el `render.yaml` de Control Autos: mismo
   `buildCommand` de dos pasos — backend y frontend —, disco persistente para el archivo SQLite, y las variables
   `RP_ID`, `ORIGIN` y `SESSION_SECRET` con los valores reales de tu dominio en Render).
3. Comparte el enlace de invitación de cada miembro una vez que el sitio esté en línea — a partir de ahí ya pueden
   entrar desde su celular con Face ID / huella, sin depender de tu Mac encendida.

## Ajustes que puedes hacer sin tocar código

- **Umbral de alerta** (80% aviso / 100% alerta): `backend/src/lib/presupuestos.ts`.
- **Categorías de gasto**: desde el panel de Admin, en cualquier momento.
- **Nombre del sistema**: cambia el texto en `frontend/index.html` (`<title>`) y en `frontend/src/components/Layout.tsx`.
