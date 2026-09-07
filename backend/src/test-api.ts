// Suite de pruebas rápida sobre una base de datos temporal (nunca toca los
// datos reales de la familia). Corre con `npm test` dentro de backend/.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbTemporal = path.join(os.tmpdir(), `controlfamiliar-test-${Date.now()}.db`);
process.env.DATABASE_FILE = dbTemporal;
process.env.SESSION_SECRET = 'test-secret';
process.env.RP_ID = 'localhost';
process.env.ORIGIN = 'http://localhost:5173';

const { buildApp } = await import('./app.js');
const {
  crearMiembro,
  editarMiembro,
  listarMiembros,
  eliminarMiembro,
  contarAdminsActivos,
  crearCasa,
  editarCasa,
  listarCasas,
  eliminarCasa,
  crearCategoria,
  editarCategoria,
  listarCategorias,
  eliminarCategoria,
  crearGasto,
  listarGastos,
  asignarPresupuesto,
  presupuestoDeMiembro,
  buscarMiembroPorId,
  crearCredencial,
  credencialesDeMiembro,
  marcarInteraccion,
  sesionSigueActiva,
  db,
} = await import('./lib/db.js');
const { estadoDePresupuesto } = await import('./lib/presupuestos.js');
const { firmarSesion, COOKIE } = await import('./lib/jwt.js');

function cookieDeSesion(miembro: { id: string; nombre: string; rol: 'admin' | 'miembro' }) {
  const token = firmarSesion({ miembroId: miembro.id, nombre: miembro.nombre, rol: miembro.rol });
  // Un login real marca "interacción" en cuanto entra (ver auth.ts) -- se
  // imita aquí para que una cookie recién armada en las pruebas no caiga
  // de inmediato en el candado de "sesión cerrada por inactividad".
  marcarInteraccion(miembro.id);
  return `${COOKIE.name}=${token}`;
}

let fallas = 0;
function ok(cond: boolean, mensaje: string) {
  if (!cond) {
    fallas++;
    console.error(`✗ ${mensaje}`);
  } else {
    console.log(`✓ ${mensaje}`);
  }
}

async function main() {
  const app = await buildApp({ logger: false });

  const salud = await app.inject({ method: 'GET', url: '/api/salud' });
  ok(salud.statusCode === 200, 'GET /api/salud responde 200');

  const estadoVacio = await app.inject({ method: 'GET', url: '/api/auth/estado' });
  ok(estadoVacio.json().hayMiembros === false, 'estado reporta que no hay miembros al inicio');

  const sinSesion = await app.inject({ method: 'GET', url: '/api/miembros' });
  ok(sinSesion.statusCode === 401, 'sin sesión, /api/miembros rechaza con 401');

  // --- Datos de prueba directos (sin pasar por WebAuthn, que necesita un
  // navegador real) para validar reglas de negocio: presupuestos, gastos y
  // permisos de "solo mis propios gastos".
  const casa = crearCasa('Casa Centro');
  const categoria = crearCategoria('Categoría de prueba');
  const admin = crearMiembro({ nombre: 'Admin de prueba', casaId: null, rol: 'admin' });
  const miembro = crearMiembro({ nombre: 'Miembro de prueba', casaId: casa.id, rol: 'miembro' });

  asignarPresupuesto(miembro.id, '2026-09', 1000);
  crearGasto({ miembroId: miembro.id, casaId: casa.id, categoriaId: categoria.id, monto: 850, fecha: '2026-09-05', nota: null });

  ok(estadoDePresupuesto(850, 1000) === 'aviso', 'al 85% del presupuesto el estado es "aviso"');
  ok(estadoDePresupuesto(1000, 1000) === 'alerta', 'al 100% del presupuesto el estado es "alerta"');
  ok(estadoDePresupuesto(200, 1000) === 'ok', 'muy por debajo del presupuesto el estado es "ok"');

  ok(Boolean(admin.rol === 'admin'), 'el primer miembro creado puede ser administrador');
  ok(Boolean(miembro.rol === 'miembro'), 'un miembro regular no es administrador');

  // --- Renombrar casas y categorías.
  editarCasa(casa.id, { nombre: 'Casa Centro (renombrada)' });
  ok(listarCasas().find((c) => c.id === casa.id)?.nombre === 'Casa Centro (renombrada)', 'renombrar una casa cambia su nombre');

  // Dos personas dando de alta la misma categoría (sin ponerse de acuerdo)
  // no debe tronar por nombre repetido -- debe reutilizar la existente.
  const categoriaDuplicada = crearCategoria('Categoría de prueba');
  ok(categoriaDuplicada.id === categoria.id, 'crear una categoría con nombre repetido reutiliza la existente en vez de tronar');

  // --- Borrar (de verdad, no "dar de baja") una casa/categoría que ya
  // tiene gastos: debe borrar también esos gastos, sin dejar referencias
  // rotas, y sin tronar. Se usan una casa y categoría nuevas para no
  // afectar al miembro/gasto de prueba de arriba.
  const casaBorrable = crearCasa('Casa a borrar');
  const categoriaBorrable = crearCategoria('Categoría a borrar');
  const miembroEnCasaBorrable = crearMiembro({ nombre: 'Miembro en casa a borrar', casaId: casaBorrable.id, rol: 'miembro' });
  const gastoBorrable = crearGasto({
    miembroId: miembroEnCasaBorrable.id,
    casaId: casaBorrable.id,
    categoriaId: categoriaBorrable.id,
    monto: 100,
    fecha: '2026-09-05',
    nota: null,
  });

  ok(listarCasas().find((c) => c.id === casaBorrable.id)?.numGastos === 1, 'listarCasas reporta cuántos gastos tiene cada casa');
  ok(
    listarCategorias().find((c) => c.id === categoriaBorrable.id)?.numGastos === 1,
    'listarCategorias reporta cuántos gastos tiene cada categoría'
  );

  eliminarCasa(casaBorrable.id);
  ok(listarCasas().find((c) => c.id === casaBorrable.id) === undefined, 'borrar una casa la quita de la lista');
  ok(listarGastos().find((g) => g.id === gastoBorrable.id) === undefined, 'borrar una casa borra también sus gastos');
  ok(
    buscarMiembroPorId(miembroEnCasaBorrable.id)?.casaId === null,
    'borrar una casa deja "sin casa" a quien la tenía asignada, sin dejar una referencia rota'
  );

  const categoriaBorrable2 = crearCategoria('Categoría a borrar 2');
  const gastoBorrable2 = crearGasto({
    miembroId: miembro.id,
    casaId: casa.id,
    categoriaId: categoriaBorrable2.id,
    monto: 50,
    fecha: '2026-09-05',
    nota: null,
  });
  eliminarCategoria(categoriaBorrable2.id);
  ok(listarCategorias().find((c) => c.id === categoriaBorrable2.id) === undefined, 'borrar una categoría la quita de la lista');
  ok(listarGastos().find((g) => g.id === gastoBorrable2.id) === undefined, 'borrar una categoría borra también sus gastos');

  // --- Borrar a un miembro (ya no "dar de baja"): también se borran sus
  // gastos y su presupuesto, sin dejar referencias rotas.
  asignarPresupuesto(miembro.id, '2026-09', 1000);
  ok(listarMiembros().find((m) => m.id === miembro.id)?.numGastos === 1, 'listarMiembros reporta cuántos gastos tiene cada miembro');
  eliminarMiembro(miembro.id);
  ok(buscarMiembroPorId(miembro.id) === undefined, 'borrar un miembro lo quita de la lista');
  ok(listarGastos().find((g) => g.miembroId === miembro.id) === undefined, 'borrar un miembro borra también sus gastos');
  ok(presupuestoDeMiembro(miembro.id, '2026-09') === undefined, 'borrar un miembro borra también su presupuesto');

  // --- Ver y revocar las passkeys de un miembro una por una (sin borrar
  // al miembro completo) -- para cuando alguien perdió o cambió de
  // dispositivo. Se usa un miembro nuevo, dedicado, para no interferir con
  // el resto de las pruebas.
  const miembroConPasskeys = crearMiembro({ nombre: 'Miembro con dos passkeys', casaId: null, rol: 'miembro' });
  crearCredencial({
    id: 'cred-1',
    miembroId: miembroConPasskeys.id,
    publicKey: Buffer.from('llave-de-prueba-1'),
    counter: 0,
    transports: '["internal"]',
  });
  crearCredencial({
    id: 'cred-2',
    miembroId: miembroConPasskeys.id,
    publicKey: Buffer.from('llave-de-prueba-2'),
    counter: 0,
    transports: '["usb"]',
  });
  ok(
    listarMiembros().find((m) => m.id === miembroConPasskeys.id)?.numCredenciales === 2,
    'listarMiembros reporta cuántas passkeys tiene cada miembro'
  );

  const cookieAdminPasskeys = cookieDeSesion(admin);
  const listaCredenciales = await app.inject({
    method: 'GET',
    url: `/api/miembros/${miembroConPasskeys.id}/credenciales`,
    headers: { cookie: cookieAdminPasskeys },
  });
  const credencialesDevueltas = listaCredenciales.json();
  ok(listaCredenciales.statusCode === 200 && credencialesDevueltas.length === 2, 'GET .../credenciales lista las dos passkeys');
  ok(
    credencialesDevueltas.every((c: any) => c.publicKey === undefined && c.counter === undefined),
    'GET .../credenciales no expone la llave pública ni el contador, solo lo que hace falta para mostrarlas'
  );

  const revocar = await app.inject({
    method: 'DELETE',
    url: `/api/miembros/${miembroConPasskeys.id}/credenciales/cred-1`,
    headers: { cookie: cookieAdminPasskeys },
  });
  ok(revocar.statusCode === 200, 'se puede revocar una passkey individual sin borrar al miembro');
  ok(credencialesDeMiembro(miembroConPasskeys.id).length === 1, 'tras revocar una, solo queda la otra passkey');
  ok(
    buscarMiembroPorId(miembroConPasskeys.id) !== undefined,
    'revocar una passkey no borra al miembro (sigue existiendo, solo perdió ese dispositivo)'
  );

  // --- Caso límite: un administrador NO puede revocarse a sí mismo su
  // única passkey si en ese momento es el único administrador activo --
  // quedaría sin ninguna forma de volver a entrar (aquí no hay usuario ni
  // contraseña, solo passkeys). Se arma la situación sin tocar el rol de
  // "admin": se crea otro admin, se desactiva a "admin" un momento (para que
  // el nuevo quede como único activo), se prueba el candado, y se restaura
  // todo antes de seguir.
  const otroAdmin = crearMiembro({ nombre: 'Segundo admin de prueba', casaId: null, rol: 'admin' });
  crearCredencial({
    id: 'cred-otro-admin',
    miembroId: otroAdmin.id,
    publicKey: Buffer.from('llave-de-prueba-otro-admin'),
    counter: 0,
    transports: '["internal"]',
  });
  const desactivarAdminOriginal = await app.inject({
    method: 'PATCH',
    url: `/api/miembros/${admin.id}`,
    headers: { cookie: cookieAdminPasskeys },
    payload: { activo: false },
  });
  ok(
    desactivarAdminOriginal.statusCode === 200,
    'se puede desactivar al admin original porque en ese momento hay otro administrador activo'
  );

  const cookieOtroAdmin = cookieDeSesion(otroAdmin);
  const autorevocarUnicaPasskey = await app.inject({
    method: 'DELETE',
    url: `/api/miembros/${otroAdmin.id}/credenciales/cred-otro-admin`,
    headers: { cookie: cookieOtroAdmin },
  });
  ok(
    autorevocarUnicaPasskey.statusCode === 409,
    'el único administrador activo no puede revocarse a sí mismo su única passkey'
  );
  ok(
    credencialesDeMiembro(otroAdmin.id).length === 1,
    'el candado anterior de verdad impidió que se borrara esa passkey'
  );

  // Se restaura el estado: admin original vuelve a estar activo, y el
  // segundo admin se limpia por completo para no dejar residuos en pruebas
  // posteriores que asumen que "admin" es el único administrador.
  const reactivarAdminOriginal = await app.inject({
    method: 'PATCH',
    url: `/api/miembros/${admin.id}`,
    headers: { cookie: cookieOtroAdmin },
    payload: { activo: true },
  });
  ok(reactivarAdminOriginal.statusCode === 200, 'se restaura al admin original como activo');
  eliminarMiembro(otroAdmin.id);

  // --- Cierre de sesión por inactividad: si no hubo ninguna interacción
  // real (POST /api/auth/actividad) en los últimos 30s, requireAuth debe
  // rechazar aunque la cookie siga siendo válida por dentro. Se prueba
  // retrocediendo el reloj a mano (vía SQL directo), sin esperar 30
  // segundos de verdad.
  const miembroInactividad = crearMiembro({ nombre: 'Miembro para probar inactividad', casaId: null, rol: 'miembro' });
  const cookieInactividad = cookieDeSesion(miembroInactividad);

  const antesDeExpirar = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieInactividad } });
  ok(antesDeExpirar.statusCode === 200, 'recién "entrado" (cookieDeSesion ya marca interacción), la sesión sigue viva');

  db.prepare("UPDATE miembros SET ultima_interaccion = datetime('now', '-31 seconds') WHERE id = ?").run(miembroInactividad.id);
  ok(!sesionSigueActiva(miembroInactividad.id), 'sesionSigueActiva detecta que ya pasaron más de 30s sin interacción real');

  const despuesDeExpirar = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieInactividad } });
  ok(despuesDeExpirar.statusCode === 401, 'sin interacción real por más de 30s, la sesión se rechaza aunque la cookie siga firmada');
  ok(
    String(despuesDeExpirar.headers['set-cookie'] ?? '').includes(`${COOKIE.name}=;`),
    'al rechazar por inactividad, el servidor también borra la cookie'
  );

  // El "latido" de presencia (usado solo para "en línea") no puede resucitar
  // por sí solo una sesión ya expirada.
  const pingTrasExpirar = await app.inject({ method: 'POST', url: '/api/auth/actividad', headers: { cookie: cookieInactividad } });
  ok(pingTrasExpirar.statusCode === 401, 'una sesión ya expirada no puede "revivirse" llamando a /api/auth/actividad');

  // Pero con una sesión todavía viva, si el frontend reporta una interacción
  // real, sí se extiende la ventana de los 30s.
  const cookieInactividad2 = cookieDeSesion(miembroInactividad);
  db.prepare("UPDATE miembros SET ultima_interaccion = datetime('now', '-20 seconds') WHERE id = ?").run(miembroInactividad.id);
  const ping = await app.inject({ method: 'POST', url: '/api/auth/actividad', headers: { cookie: cookieInactividad2 } });
  ok(ping.statusCode === 200, 'con sesión viva, POST /api/auth/actividad marca la interacción');
  ok(sesionSigueActiva(miembroInactividad.id), 'tras marcar interacción, sesionSigueActiva vuelve a ser cierto');

  eliminarMiembro(miembroInactividad.id);

  // --- Cambiar el rol de un miembro (a diferencia de dar de baja/borrar,
  // esto ya lo soportaba la ruta PATCH -- se prueba aquí de una vez que se
  // está tocando esta zona).
  const cambiarARol = await app.inject({
    method: 'PATCH',
    url: `/api/miembros/${miembroConPasskeys.id}`,
    headers: { cookie: cookieAdminPasskeys },
    payload: { rol: 'admin' },
  });
  ok(cambiarARol.statusCode === 200 && cambiarARol.json().rol === 'admin', 'el admin puede ascender a un miembro a administrador');

  // Se regresa a "miembro" (no debe fallar: en este punto hay dos
  // administradores activos, así que no se estaría dejando a la familia
  // sin ninguno) -- deja el estado limpio para las pruebas de abajo, que
  // asumen que "admin" es el único administrador.
  const bajarDeRol = await app.inject({
    method: 'PATCH',
    url: `/api/miembros/${miembroConPasskeys.id}`,
    headers: { cookie: cookieAdminPasskeys },
    payload: { rol: 'miembro' },
  });
  ok(
    bajarDeRol.statusCode === 200 && bajarDeRol.json().rol === 'miembro',
    'con otro administrador activo, sí se puede bajarle el rol a alguien más'
  );

  // No se puede dejar a la familia sin ningún administrador: si "admin" es
  // el único administrador, contarAdminsActivos (usado por la ruta DELETE)
  // debe marcarlo como el último.
  ok(contarAdminsActivos(admin.id) === 0, 'contarAdminsActivos detecta que borrar al único admin dejaría la familia sin ninguno');

  // --- Lo mismo pero a través de la ruta HTTP real (no solo la función de
  // base de datos): que el candado de "al menos un admin" también aplique
  // ahí, y que borrar al último miembro de toda la familia deje al sistema
  // listo para volver a fundarse (lo que se reportó como el bug real:
  // después de borrar a todos, incluyendo al admin, había que poder volver
  // a pedir "quiero ser el administrador" en vez de quedarse atorado).
  ok(admin.rol === 'admin', 'admin de prueba sigue siendo administrador para las pruebas de la ruta DELETE');
  const cookieAdmin = cookieDeSesion(admin);

  // El mismo candado, pero por cambio de rol en vez de borrado: quitarle
  // el rol de admin al único administrador tampoco debe dejarse.
  const bajarAlUnicoAdmin = await app.inject({
    method: 'PATCH',
    url: `/api/miembros/${admin.id}`,
    headers: { cookie: cookieAdmin },
    payload: { rol: 'miembro' },
  });
  ok(
    bajarAlUnicoAdmin.statusCode === 409,
    'quitarle el rol de admin al único administrador (sin borrarlo) también está bloqueado'
  );

  const borrarUnicoAdmin = await app.inject({
    method: 'DELETE',
    url: `/api/miembros/${admin.id}`,
    headers: { cookie: cookieAdmin },
  });
  ok(borrarUnicoAdmin.statusCode === 409, 'la ruta DELETE /api/miembros también impide borrar al único administrador');

  const segundoAdmin = crearMiembro({ nombre: 'Segundo admin de prueba', casaId: null, rol: 'admin' });
  const borrarConOtroAdminDisponible = await app.inject({
    method: 'DELETE',
    url: `/api/miembros/${admin.id}`,
    headers: { cookie: cookieAdmin },
  });
  ok(
    borrarConOtroAdminDisponible.statusCode === 200,
    'con otro administrador activo, sí se puede borrar (incluso a uno mismo)'
  );

  // Se borra también al último administrador que queda, y a quien haya
  // quedado de pruebas anteriores -- simula el caso real de Jorge (se
  // borró a todos, incluyendo al admin) sin pasar por el candado de la
  // ruta, para probar la recuperación del sistema con la familia
  // realmente vacía.
  eliminarMiembro(segundoAdmin.id);
  for (const m of listarMiembros()) eliminarMiembro(m.id);

  const estadoTrasVaciarFamilia = await app.inject({ method: 'GET', url: '/api/auth/estado' });
  ok(
    estadoTrasVaciarFamilia.json().hayMiembros === false,
    'al quedar la familia sin ningún miembro, el estado vuelve a reportar que no hay miembros'
  );

  const bootstrapDeNuevo = await app.inject({
    method: 'POST',
    url: '/api/auth/bootstrap/opciones',
    payload: { nombre: 'Nuevo admin tras vaciar todo' },
  });
  ok(
    bootstrapDeNuevo.statusCode === 200,
    'con la familia vacía, se puede volver a fundar el sistema con un nuevo administrador'
  );

  await app.close();
  fs.rmSync(dbTemporal, { force: true });

  if (fallas > 0) {
    console.error(`\n${fallas} prueba(s) fallaron`);
    process.exit(1);
  }
  console.log('\nTodas las pruebas pasaron ✓');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
