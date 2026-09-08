import type { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import {
  contarMiembros,
  crearMiembro,
  buscarMiembroPorId,
  credencialesDeMiembro,
  buscarCredencialPorId,
  crearCredencial,
  actualizarContadorCredencial,
  buscarInvitacionValida,
  marcarInvitacionUsada,
  cerrarActividad,
  marcarInteraccion,
  type MiembroConEstado,
} from '../lib/db.js';
import { guardarChallenge, tomarChallenge } from '../lib/challengeStore.js';
import { requireAuth, identificarSiHaySesion } from '../lib/authGuard.js';
import { firmarSesion, COOKIE } from '../lib/jwt.js';
import { bitacora } from '../lib/bitacora.js';

const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = process.env.RP_NAME || 'Control Familiar';
const ORIGINS = (process.env.ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim());

function miembroParaCliente(m: MiembroConEstado) {
  return {
    id: m.id,
    nombre: m.nombre,
    casaIds: m.casaIds,
    todasLasCasas: m.todasLasCasas,
    rol: m.rol,
    sinPresupuesto: m.sinPresupuesto,
  };
}

function opcionesRegistro(miembro: { id: string; nombre: string }, credencialesExcluir: { id: string; transports: string | null }[]) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: miembro.nombre,
    userDisplayName: miembro.nombre,
    attestationType: 'none',
    excludeCredentials: credencialesExcluir.map((c) => ({
      id: c.id,
      transports: c.transports ? JSON.parse(c.transports) : undefined,
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
      // authenticatorAttachment: 'platform' por sí solo no bastaba: algunos
      // navegadores (sobre todo Chrome) igual ofrecían primero "usar otro
      // dispositivo" con un código QR en vez de Face ID / huella del propio
      // teléfono. "localDevice" además manda el "hint" nuevo del estándar
      // (hints: ['client-device']), que si lo entiende el navegador le dice
      // desde antes de armar su pantalla "usa este mismo dispositivo" -- ya
      // ni se le ocurre ofrecer el QR como primera opción.
      authenticatorAttachment: 'platform',
    },
    preferredAuthenticatorType: 'localDevice',
  });
}

async function completarRegistro(
  miembroId: string,
  response: RegistrationResponseJSON,
  challenge: string
) {
  const verificacion = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: ORIGINS,
    expectedRPID: RP_ID,
  });
  if (!verificacion.verified || !verificacion.registrationInfo) {
    throw new Error('Passkey no verificada');
  }
  const { credential } = verificacion.registrationInfo;
  crearCredencial({
    id: credential.id,
    miembroId,
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ? JSON.stringify(credential.transports) : null,
  });
}

export default async function authRoutes(app: FastifyInstance) {
  // El frontend usa esto para decidir qué pantalla mostrar de entrada:
  // si no hay ningún miembro todavía, se ofrece "quiero ser administrador".
  app.get('/api/auth/estado', async () => ({ hayMiembros: contarMiembros() > 0 }));

  // --- Arranque: la primera persona funda el sistema como administrador ---

  app.post<{ Body: { nombre: string } }>(
    '/api/auth/bootstrap/opciones',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      if (contarMiembros() > 0) {
        return reply.code(409).send({ error: 'Ya existe un administrador; pide que te den de alta.' });
      }
      const nombre = req.body?.nombre?.trim();
      if (!nombre) return reply.code(400).send({ error: 'Falta el nombre' });

      const miembro = crearMiembro({ nombre, rol: 'admin' });
      const options = await opcionesRegistro(miembro, []);
      guardarChallenge(miembro.id, options.challenge);
      return { options, miembroId: miembro.id };
    }
  );

  app.post<{ Body: { miembroId: string; response: RegistrationResponseJSON } }>(
    '/api/auth/bootstrap/verificar',
    async (req, reply) => {
      const { miembroId, response } = req.body || {};
      if (!miembroId || !response) return reply.code(400).send({ error: 'Solicitud inválida' });

      const entrada = tomarChallenge(miembroId);
      if (!entrada) return reply.code(400).send({ error: 'El reto expiró, intenta de nuevo' });

      const miembro = buscarMiembroPorId(miembroId);
      if (!miembro || miembro.rol !== 'admin' || miembro.tienePasskey) {
        return reply.code(400).send({ error: 'Solicitud inválida' });
      }

      try {
        await completarRegistro(miembroId, response, entrada.challenge);
      } catch (err) {
        req.log.error(err);
        bitacora(req, {
          miembroId: miembro.id,
          nombreActor: miembro.nombre,
          tipo: 'registro_fallido',
          categoria: 'acceso',
          descripcion: `No se pudo verificar la passkey al intentar fundar el sistema (${miembro.nombre})`,
        });
        return reply.code(400).send({ error: 'No se pudo verificar la passkey' });
      }

      const token = firmarSesion({ miembroId: miembro.id, nombre: miembro.nombre, rol: 'admin' });
      reply.setCookie(COOKIE.name, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: COOKIE.maxAge });
      marcarInteraccion(miembro.id); // arranca el reloj de inactividad justo al entrar
      bitacora(req, {
        miembroId: miembro.id,
        nombreActor: miembro.nombre,
        tipo: 'registro_passkey',
        categoria: 'acceso',
        descripcion: `${miembro.nombre} registró su passkey y fundó el sistema como administrador`,
      });
      return { ok: true, miembro: miembroParaCliente(miembro) };
    }
  );

  // --- Alta por invitación (enlace único de un solo uso, generado por el admin) ---

  app.get<{ Params: { token: string } }>('/api/auth/invitacion/:token', async (req, reply) => {
    const invitacion = buscarInvitacionValida(req.params.token);
    if (!invitacion) return reply.code(404).send({ error: 'El enlace ya no es válido o expiró' });
    const miembro = buscarMiembroPorId(invitacion.miembroId);
    if (!miembro) return reply.code(404).send({ error: 'El enlace ya no es válido' });
    const casaNombre = miembro.todasLasCasas
      ? 'Todas las casas'
      : miembro.casaNombres.length
        ? miembro.casaNombres.join(', ')
        : null;
    return { nombre: miembro.nombre, casaNombre };
  });

  app.post<{ Params: { token: string } }>(
    '/api/auth/invitacion/:token/opciones',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const invitacion = buscarInvitacionValida(req.params.token);
      if (!invitacion) return reply.code(404).send({ error: 'El enlace ya no es válido o expiró' });
      const miembro = buscarMiembroPorId(invitacion.miembroId);
      if (!miembro) return reply.code(404).send({ error: 'El enlace ya no es válido' });

      const credenciales = credencialesDeMiembro(miembro.id);
      const options = await opcionesRegistro(miembro, credenciales.map((c) => ({ id: c.id, transports: c.transports })));
      guardarChallenge(`inv:${req.params.token}`, options.challenge);
      return { options, miembroId: miembro.id };
    }
  );

  app.post<{ Params: { token: string }; Body: { response: RegistrationResponseJSON } }>(
    '/api/auth/invitacion/:token/verificar',
    async (req, reply) => {
      const invitacion = buscarInvitacionValida(req.params.token);
      if (!invitacion) return reply.code(404).send({ error: 'El enlace ya no es válido o expiró' });

      const entrada = tomarChallenge(`inv:${req.params.token}`);
      if (!entrada) return reply.code(400).send({ error: 'El reto expiró, intenta de nuevo' });

      const miembro = buscarMiembroPorId(invitacion.miembroId);
      if (!miembro) return reply.code(404).send({ error: 'El enlace ya no es válido' });

      const response = req.body?.response;
      if (!response) return reply.code(400).send({ error: 'Solicitud inválida' });

      // Se anota ANTES de completar el registro si ya tenía alguna passkey,
      // para poder distinguir en la bitácora "se registró por primera vez"
      // de "agregó una adicional" (por ejemplo porque perdió su teléfono).
      const yaTeniaPasskey = credencialesDeMiembro(miembro.id).length > 0;

      try {
        await completarRegistro(miembro.id, response, entrada.challenge);
      } catch (err) {
        req.log.error(err);
        bitacora(req, {
          miembroId: miembro.id,
          nombreActor: miembro.nombre,
          tipo: 'registro_fallido',
          categoria: 'acceso',
          descripcion: `No se pudo verificar la passkey al intentar registrarse (${miembro.nombre})`,
        });
        return reply.code(400).send({ error: 'No se pudo verificar la passkey' });
      }

      marcarInvitacionUsada(req.params.token);

      const token = firmarSesion({ miembroId: miembro.id, nombre: miembro.nombre, rol: miembro.rol });
      reply.setCookie(COOKIE.name, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: COOKIE.maxAge });
      marcarInteraccion(miembro.id); // arranca el reloj de inactividad justo al entrar
      bitacora(req, {
        miembroId: miembro.id,
        nombreActor: miembro.nombre,
        tipo: yaTeniaPasskey ? 'passkey_agregada' : 'registro_passkey',
        categoria: 'acceso',
        descripcion: yaTeniaPasskey
          ? `${miembro.nombre} agregó una passkey adicional`
          : `${miembro.nombre} registró su passkey por primera vez`,
      });
      return { ok: true, miembro: miembroParaCliente(miembro) };
    }
  );

  // --- Inicio de sesión (sin escribir nombre: el navegador ofrece las
  // passkeys guardadas para este sitio, porque se registraron como
  // "resident key") ---

  app.post('/api/auth/login/opciones', async () => {
    const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'preferred' });
    // generateAuthenticationOptions (a diferencia de la de registro) todavía
    // no trae un atajo para esto, pero el campo "hints" del estándar
    // también aplica aquí -- se agrega a mano para la misma razón: que el
    // navegador prefiera el propio dispositivo en vez de ofrecer primero
    // "usar otro dispositivo" con un código QR.
    (options as { hints?: string[] }).hints = ['client-device'];
    const requestId = crypto.randomUUID();
    guardarChallenge(requestId, options.challenge);
    return { options, requestId };
  });

  app.post<{ Body: { requestId: string; response: AuthenticationResponseJSON } }>(
    '/api/auth/login/verificar',
    async (req, reply) => {
      const { requestId, response } = req.body || {};
      if (!requestId || !response) return reply.code(400).send({ error: 'Solicitud inválida' });

      const entrada = tomarChallenge(requestId);
      if (!entrada) return reply.code(400).send({ error: 'El reto expiró, intenta de nuevo' });

      const credencial = buscarCredencialPorId(response.id);
      if (!credencial) {
        bitacora(req, {
          miembroId: null,
          nombreActor: 'Desconocido',
          tipo: 'login_fallido',
          categoria: 'acceso',
          descripcion: 'Intento de acceso con una passkey no registrada en el sistema',
        });
        return reply.code(400).send({ error: 'Esta passkey no está registrada aquí' });
      }

      // A partir de aquí ya se sabe de quién es la credencial, aunque la
      // verificación falle más adelante -- eso es justo lo que hace valiosa
      // a esta bitácora (saber QUIÉN intentó, no solo que algo falló).
      const nombreIntento = buscarMiembroPorId(credencial.miembro.id)?.nombre ?? 'Desconocido';

      let verificacion;
      try {
        verificacion = await verifyAuthenticationResponse({
          response,
          expectedChallenge: entrada.challenge,
          expectedOrigin: ORIGINS,
          expectedRPID: RP_ID,
          credential: {
            id: credencial.id,
            publicKey: new Uint8Array(credencial.publicKey),
            counter: credencial.counter,
            transports: credencial.transports ? JSON.parse(credencial.transports) : undefined,
          },
        });
      } catch (err) {
        req.log.error(err);
        bitacora(req, {
          miembroId: credencial.miembro.id,
          nombreActor: nombreIntento,
          tipo: 'login_fallido',
          categoria: 'acceso',
          descripcion: `Intento de acceso fallido de ${nombreIntento} (no se pudo verificar la passkey)`,
        });
        return reply.code(400).send({ error: 'No se pudo verificar la passkey' });
      }

      if (!verificacion.verified) {
        bitacora(req, {
          miembroId: credencial.miembro.id,
          nombreActor: nombreIntento,
          tipo: 'login_fallido',
          categoria: 'acceso',
          descripcion: `Intento de acceso fallido de ${nombreIntento} (passkey no verificada)`,
        });
        return reply.code(400).send({ error: 'Passkey no verificada' });
      }

      actualizarContadorCredencial(credencial.id, verificacion.authenticationInfo.newCounter);

      const miembro = buscarMiembroPorId(credencial.miembro.id);
      if (!miembro || !miembro.activo) {
        bitacora(req, {
          miembroId: credencial.miembro.id,
          nombreActor: nombreIntento,
          tipo: 'login_fallido',
          categoria: 'acceso',
          descripcion: `${nombreIntento} intentó entrar pero su cuenta está dada de baja`,
        });
        return reply.code(401).send({ error: 'Esta cuenta ya no está activa' });
      }

      const token = firmarSesion({ miembroId: miembro.id, nombre: miembro.nombre, rol: miembro.rol });
      reply.setCookie(COOKIE.name, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: COOKIE.maxAge });
      marcarInteraccion(miembro.id); // arranca el reloj de inactividad justo al entrar
      bitacora(req, {
        miembroId: miembro.id,
        nombreActor: miembro.nombre,
        tipo: 'login_exitoso',
        categoria: 'acceso',
        descripcion: `${miembro.nombre} inició sesión`,
      });
      return { ok: true, miembro: miembroParaCliente(miembro) };
    }
  );

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    if (!req.miembro) return reply.code(401).send({ error: 'No autenticado' });
    const miembro = buscarMiembroPorId(req.miembro.miembroId);
    if (!miembro) return reply.code(401).send({ error: 'No autenticado' });
    return { miembro: miembroParaCliente(miembro) };
  });

  // El frontend llama esto (con límite, cada pocos segundos como máximo)
  // cada vez que detecta una interacción real de la persona (clic, tecla,
  // touch, scroll) mientras hay sesión -- es lo único que mantiene viva la
  // sesión frente al cierre por inactividad de requireAuth. A propósito no
  // se marca en cada petición (el "latido" de presencia de /api/auth/me
  // cada 45s, usado solo para mostrar "en línea", no cuenta como
  // interacción real, o nunca se cerraría la sesión de alguien que dejó la
  // pestaña abierta y se fue).
  app.post('/api/auth/actividad', { preHandler: requireAuth }, async (req) => {
    if (req.miembro) marcarInteraccion(req.miembro.miembroId);
    return { ok: true };
  });

  app.post('/api/auth/logout', { preHandler: identificarSiHaySesion }, async (req: FastifyRequest, reply) => {
    if (req.miembro) {
      cerrarActividad(req.miembro.miembroId);
      bitacora(req, {
        miembroId: req.miembro.miembroId,
        nombreActor: req.miembro.nombre,
        tipo: 'logout',
        categoria: 'acceso',
        descripcion: `${req.miembro.nombre} cerró sesión`,
      });
    }
    reply.clearCookie(COOKIE.name, { path: '/' });
    return { ok: true };
  });
}
