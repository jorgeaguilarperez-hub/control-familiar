// Capa de datos con el módulo nativo node:sqlite (sin binarios externos que
// descargar, todo vive dentro del propio Node). Guarda un archivo real de
// SQLite en disco, junto al proyecto — mismo patrón que Control Autos.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.DATABASE_FILE || path.join(dataDir, 'controlfamiliar.db');

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

// Los borrados "de verdad" (casa/categoría/miembro) hacen varios DELETE en
// cascada a mano -- sin esto, si uno de esos DELETE fallara a la mitad
// (por ejemplo un candado inesperado de SQLite), podría quedar el borrado
// aplicado solo a la mitad. Con la transacción, o se aplican todos los
// pasos o ninguno.
export function conTransaccion<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
db.exec(`
  CREATE TABLE IF NOT EXISTS casas (
    id TEXT PRIMARY KEY,
    nombre TEXT UNIQUE NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS miembros (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    casa_id TEXT REFERENCES casas(id),
    rol TEXT NOT NULL DEFAULT 'miembro',
    activo INTEGER NOT NULL DEFAULT 1,
    ultima_actividad TEXT,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS credenciales (
    id TEXT PRIMARY KEY,
    miembro_id TEXT NOT NULL REFERENCES miembros(id),
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invitaciones (
    token TEXT PRIMARY KEY,
    miembro_id TEXT NOT NULL REFERENCES miembros(id),
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    expira_en TEXT NOT NULL,
    usado_en TEXT
  );

  CREATE TABLE IF NOT EXISTS categorias (
    id TEXT PRIMARY KEY,
    nombre TEXT UNIQUE NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS presupuestos (
    id TEXT PRIMARY KEY,
    miembro_id TEXT NOT NULL REFERENCES miembros(id),
    periodo TEXT NOT NULL,
    monto REAL NOT NULL,
    UNIQUE(miembro_id, periodo)
  );

  CREATE TABLE IF NOT EXISTS gastos (
    id TEXT PRIMARY KEY,
    miembro_id TEXT NOT NULL REFERENCES miembros(id),
    casa_id TEXT NOT NULL REFERENCES casas(id),
    categoria_id TEXT NOT NULL REFERENCES categorias(id),
    monto REAL NOT NULL,
    fecha TEXT NOT NULL,
    nota TEXT,
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migraciones aditivas: si el archivo de datos ya existía de antes de que
// casas/categorías tuvieran "activo", se agrega la columna sin tocar nada
// de lo que ya había (nunca destructivo).
const columnasCasas = db.prepare('PRAGMA table_info(casas)').all() as { name: string }[];
if (!columnasCasas.some((c) => c.name === 'activo')) {
  db.exec('ALTER TABLE casas ADD COLUMN activo INTEGER NOT NULL DEFAULT 1');
}
const columnasCategorias = db.prepare('PRAGMA table_info(categorias)').all() as { name: string }[];
if (!columnasCategorias.some((c) => c.name === 'activo')) {
  db.exec('ALTER TABLE categorias ADD COLUMN activo INTEGER NOT NULL DEFAULT 1');
}
const columnasMiembros = db.prepare('PRAGMA table_info(miembros)').all() as { name: string }[];
if (!columnasMiembros.some((c) => c.name === 'ultima_interaccion')) {
  db.exec('ALTER TABLE miembros ADD COLUMN ultima_interaccion TEXT');
}

// ---------- Casas ----------

export type Casa = { id: string; nombre: string; activo: boolean; numGastos: number };

export function listarCasas(): Casa[] {
  const filas = db
    .prepare(
      `SELECT c.id, c.nombre, c.activo,
              (SELECT COUNT(*) FROM gastos g WHERE g.casa_id = c.id) as numGastos
       FROM casas c ORDER BY c.nombre ASC`
    )
    .all() as any[];
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, activo: Boolean(f.activo), numGastos: f.numGastos }));
}

export function crearCasa(nombre: string): Casa {
  const id = randomUUID();
  db.prepare('INSERT INTO casas (id, nombre) VALUES (?, ?)').run(id, nombre);
  return { id, nombre, activo: true, numGastos: 0 };
}

export function editarCasa(id: string, datos: { nombre?: string; activo?: boolean }): Casa | undefined {
  const actual = listarCasas().find((c) => c.id === id);
  if (!actual) return undefined;
  db.prepare('UPDATE casas SET nombre = ?, activo = ? WHERE id = ?').run(
    datos.nombre ?? actual.nombre,
    datos.activo !== undefined ? (datos.activo ? 1 : 0) : (actual.activo ? 1 : 0),
    id
  );
  return { id, nombre: datos.nombre ?? actual.nombre, activo: datos.activo ?? actual.activo, numGastos: actual.numGastos };
}

export function casaTieneGastos(id: string): boolean {
  const fila = db.prepare('SELECT COUNT(*) as n FROM gastos WHERE casa_id = ?').get(id) as { n: number };
  return fila.n > 0;
}

// Borrar una casa la borra de verdad: a petición explícita, si ya tiene
// gastos registrados también se borran esos gastos (el llamador es
// responsable de confirmar esto con la persona antes de llegar aquí). A
// quien tuviera esta casa asignada se le libera a "sin casa" en vez de
// dejar una referencia rota.
export function eliminarCasa(id: string) {
  conTransaccion(() => {
    db.prepare('UPDATE miembros SET casa_id = NULL WHERE casa_id = ?').run(id);
    db.prepare('DELETE FROM gastos WHERE casa_id = ?').run(id);
    db.prepare('DELETE FROM casas WHERE id = ?').run(id);
  });
}

// ---------- Miembros ----------

export type Rol = 'admin' | 'miembro';

export type Miembro = {
  id: string;
  nombre: string;
  casaId: string | null;
  rol: Rol;
  activo: boolean;
};

export type MiembroConEstado = Miembro & {
  casaNombre: string | null;
  enLinea: boolean;
  tienePasskey: boolean;
  numCredenciales: number;
  numGastos: number;
};

const SELECT_MIEMBRO = `
  SELECT m.id, m.nombre, m.casa_id as casaId, m.rol, m.activo,
         c.nombre as casaNombre,
         (m.ultima_actividad IS NOT NULL AND m.ultima_actividad >= datetime('now', '-3 minutes')) as enLinea,
         (SELECT COUNT(*) FROM credenciales cr WHERE cr.miembro_id = m.id) as numCredenciales,
         (SELECT COUNT(*) FROM gastos g WHERE g.miembro_id = m.id) as numGastos
  FROM miembros m
  LEFT JOIN casas c ON c.id = m.casa_id
`;

function filaAMiembro(fila: any): MiembroConEstado {
  return {
    id: fila.id,
    nombre: fila.nombre,
    casaId: fila.casaId,
    casaNombre: fila.casaNombre,
    rol: fila.rol,
    activo: Boolean(fila.activo),
    enLinea: Boolean(fila.enLinea),
    tienePasskey: fila.numCredenciales > 0,
    numCredenciales: fila.numCredenciales,
    numGastos: fila.numGastos,
  };
}

export function contarMiembros(): number {
  const fila = db.prepare('SELECT COUNT(*) as n FROM miembros').get() as { n: number };
  return fila.n;
}

export function listarMiembros(): MiembroConEstado[] {
  const filas = db.prepare(`${SELECT_MIEMBRO} ORDER BY m.nombre ASC`).all() as any[];
  return filas.map(filaAMiembro);
}

export function buscarMiembroPorId(id: string): MiembroConEstado | undefined {
  const fila = db.prepare(`${SELECT_MIEMBRO} WHERE m.id = ?`).get(id) as any;
  return fila ? filaAMiembro(fila) : undefined;
}

export function crearMiembro(datos: { nombre: string; casaId: string | null; rol: Rol }): MiembroConEstado {
  const id = randomUUID();
  db.prepare('INSERT INTO miembros (id, nombre, casa_id, rol) VALUES (?, ?, ?, ?)').run(
    id,
    datos.nombre,
    datos.casaId,
    datos.rol
  );
  return buscarMiembroPorId(id)!;
}

export function editarMiembro(
  id: string,
  datos: { nombre?: string; casaId?: string | null; rol?: Rol; activo?: boolean }
): MiembroConEstado | undefined {
  const actual = buscarMiembroPorId(id);
  if (!actual) return undefined;
  db.prepare('UPDATE miembros SET nombre = ?, casa_id = ?, rol = ?, activo = ? WHERE id = ?').run(
    datos.nombre ?? actual.nombre,
    datos.casaId !== undefined ? datos.casaId : actual.casaId,
    datos.rol ?? actual.rol,
    datos.activo !== undefined ? (datos.activo ? 1 : 0) : (actual.activo ? 1 : 0),
    id
  );
  return buscarMiembroPorId(id);
}

export function contarAdminsActivos(excluirId?: string): number {
  const filas = db
    .prepare("SELECT id FROM miembros WHERE rol = 'admin' AND activo = 1")
    .all() as { id: string }[];
  return filas.filter((f) => f.id !== excluirId).length;
}

// Borrar a un miembro lo borra de verdad (no lo deja inactivo): pierde su
// acceso (passkey e invitaciones pendientes) y, si ya tenía gastos o
// presupuestos registrados, esos también se borran -- el llamador confirma
// esto con la persona antes de llegar aquí. La regla de "que quede al
// menos un administrador" la valida la ruta, no esta función.
export function eliminarMiembro(id: string) {
  conTransaccion(() => {
    db.prepare('DELETE FROM credenciales WHERE miembro_id = ?').run(id);
    db.prepare('DELETE FROM invitaciones WHERE miembro_id = ?').run(id);
    db.prepare('DELETE FROM presupuestos WHERE miembro_id = ?').run(id);
    db.prepare('DELETE FROM gastos WHERE miembro_id = ?').run(id);
    db.prepare('DELETE FROM miembros WHERE id = ?').run(id);
  });
}

// ---------- Presencia ----------
// Igual que en Control Autos: no hay websockets. Cada petición autenticada
// refresca "última actividad", y se considera "en línea" a quien tuvo
// actividad en los últimos minutos (ver SELECT_MIEMBRO arriba).

export function marcarActividad(miembroId: string) {
  db.prepare("UPDATE miembros SET ultima_actividad = datetime('now') WHERE id = ?").run(miembroId);
}

export function cerrarActividad(miembroId: string) {
  db.prepare('UPDATE miembros SET ultima_actividad = NULL, ultima_interaccion = NULL WHERE id = ?').run(miembroId);
}

// ---------- Cierre de sesión por inactividad ----------
// Distinto de "última actividad" de arriba (que solo sirve para mostrar
// "en línea" y se refresca con cualquier petición, incluyendo el "latido"
// automático de presencia). "última interacción" solo se actualiza cuando
// el frontend reporta una interacción real de la persona (clic, tecla,
// touch, scroll -- ver POST /api/auth/actividad), así el "latido" no
// mantiene viva una sesión de alguien que ya no está frente a la pantalla.
export const IDLE_TIMEOUT_SEGUNDOS = 30;

export function marcarInteraccion(miembroId: string) {
  db.prepare("UPDATE miembros SET ultima_interaccion = datetime('now') WHERE id = ?").run(miembroId);
}

// true si hubo una interacción real en los últimos IDLE_TIMEOUT_SEGUNDOS.
// requireAuth la usa para rechazar (y borrar) una sesión inactiva, aunque
// la cookie en sí siga viva -- así, un dispositivo compartido que se queda
// quieto vuelve a pedir passkey incluso si alguien recarga la página
// después, no solo mientras la pestaña sigue abierta.
export function sesionSigueActiva(miembroId: string): boolean {
  const fila = db
    .prepare(
      `SELECT (ultima_interaccion IS NOT NULL AND ultima_interaccion >= datetime('now', ?)) as activa
       FROM miembros WHERE id = ?`
    )
    .get(`-${IDLE_TIMEOUT_SEGUNDOS} seconds`, miembroId) as { activa: number } | undefined;
  return Boolean(fila?.activa);
}

// ---------- Credenciales (passkeys) ----------

export type Credencial = {
  id: string;
  miembroId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string | null;
  creadoEn: string;
};

export function credencialesDeMiembro(miembroId: string): Credencial[] {
  return db
    .prepare(
      `SELECT id, miembro_id as miembroId, public_key as publicKey, counter, transports, creado_en as creadoEn
       FROM credenciales WHERE miembro_id = ? ORDER BY creado_en ASC`
    )
    .all(miembroId) as any[] as Credencial[];
}

// Revocar una passkey en lo individual (sin borrar a todo el miembro): útil
// para cuando alguien perdió o cambió de dispositivo y quieres que ese
// aparato ya no sirva para entrar. Si esta era su única passkey, sigue
// existiendo como miembro -- solo necesita un enlace nuevo para volver a
// registrar una (botón "Generar enlace" en el admin).
export function eliminarCredencial(id: string) {
  db.prepare('DELETE FROM credenciales WHERE id = ?').run(id);
}

export function buscarCredencialPorId(id: string): (Credencial & { miembro: Miembro }) | undefined {
  const fila = db
    .prepare(
      `SELECT c.id, c.miembro_id as miembroId, c.public_key as publicKey, c.counter, c.transports, c.creado_en as creadoEn,
              m.id as mId, m.nombre as mNombre, m.casa_id as mCasaId, m.rol as mRol, m.activo as mActivo
       FROM credenciales c JOIN miembros m ON m.id = c.miembro_id
       WHERE c.id = ?`
    )
    .get(id) as any;
  if (!fila) return undefined;
  return {
    id: fila.id,
    miembroId: fila.miembroId,
    publicKey: fila.publicKey,
    counter: fila.counter,
    transports: fila.transports,
    creadoEn: fila.creadoEn,
    miembro: {
      id: fila.mId,
      nombre: fila.mNombre,
      casaId: fila.mCasaId,
      rol: fila.mRol,
      activo: Boolean(fila.mActivo),
    },
  };
}

export function crearCredencial(c: {
  id: string;
  miembroId: string;
  publicKey: Buffer;
  counter: number;
  transports: string | null;
}) {
  db.prepare(
    'INSERT INTO credenciales (id, miembro_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?)'
  ).run(c.id, c.miembroId, c.publicKey, c.counter, c.transports);
}

export function actualizarContadorCredencial(id: string, counter: number) {
  db.prepare('UPDATE credenciales SET counter = ? WHERE id = ?').run(counter, id);
}

// ---------- Invitaciones ----------
// Enlace único de un solo uso por persona (no un código compartido): el
// admin da de alta al miembro y genera un token; esa persona entra con el
// enlace, registra su passkey y el token queda invalidado.

export type Invitacion = { token: string; miembroId: string; expiraEn: string; usadoEn: string | null };

export function crearInvitacion(miembroId: string, diasValidez = 7): Invitacion {
  const token = randomUUID();
  const expiraEn = new Date(Date.now() + diasValidez * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO invitaciones (token, miembro_id, expira_en) VALUES (?, ?, ?)').run(
    token,
    miembroId,
    expiraEn
  );
  return { token, miembroId, expiraEn, usadoEn: null };
}

export function buscarInvitacionValida(token: string): Invitacion | undefined {
  const fila = db
    .prepare(
      `SELECT token, miembro_id as miembroId, expira_en as expiraEn, usado_en as usadoEn
       FROM invitaciones
       WHERE token = ? AND usado_en IS NULL AND expira_en >= datetime('now')`
    )
    .get(token) as Invitacion | undefined;
  return fila;
}

export function marcarInvitacionUsada(token: string) {
  db.prepare("UPDATE invitaciones SET usado_en = datetime('now') WHERE token = ?").run(token);
}

// ---------- Categorías ----------

export type Categoria = { id: string; nombre: string; activo: boolean; numGastos: number };

export function listarCategorias(): Categoria[] {
  const filas = db
    .prepare(
      `SELECT cat.id, cat.nombre, cat.activo,
              (SELECT COUNT(*) FROM gastos g WHERE g.categoria_id = cat.id) as numGastos
       FROM categorias cat ORDER BY cat.nombre ASC`
    )
    .all() as any[];
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, activo: Boolean(f.activo), numGastos: f.numGastos }));
}

export function buscarCategoriaPorNombre(nombre: string): Categoria | undefined {
  const fila = db
    .prepare(
      `SELECT cat.id, cat.nombre, cat.activo,
              (SELECT COUNT(*) FROM gastos g WHERE g.categoria_id = cat.id) as numGastos
       FROM categorias cat WHERE LOWER(cat.nombre) = LOWER(?)`
    )
    .get(nombre) as any;
  return fila ? { id: fila.id, nombre: fila.nombre, activo: Boolean(fila.activo), numGastos: fila.numGastos } : undefined;
}

// Como cualquier miembro puede dar de alta una categoría (para no
// bloquearlo si le falta una al capturar un gasto), es fácil que dos
// personas intenten crear "Comida" por su cuenta -- en vez de tronar por
// el nombre repetido, se reutiliza la que ya existe (reactivándola si
// alguien la había dado de baja).
export function crearCategoria(nombre: string): Categoria {
  const existente = buscarCategoriaPorNombre(nombre);
  if (existente) {
    if (!existente.activo) return editarCategoria(existente.id, { activo: true })!;
    return existente;
  }
  const id = randomUUID();
  db.prepare('INSERT INTO categorias (id, nombre) VALUES (?, ?)').run(id, nombre);
  return { id, nombre, activo: true, numGastos: 0 };
}

export function editarCategoria(id: string, datos: { nombre?: string; activo?: boolean }): Categoria | undefined {
  const actual = listarCategorias().find((c) => c.id === id);
  if (!actual) return undefined;
  db.prepare('UPDATE categorias SET nombre = ?, activo = ? WHERE id = ?').run(
    datos.nombre ?? actual.nombre,
    datos.activo !== undefined ? (datos.activo ? 1 : 0) : (actual.activo ? 1 : 0),
    id
  );
  return { id, nombre: datos.nombre ?? actual.nombre, activo: datos.activo ?? actual.activo, numGastos: actual.numGastos };
}

export function categoriaTieneGastos(id: string): boolean {
  const fila = db.prepare('SELECT COUNT(*) as n FROM gastos WHERE categoria_id = ?').get(id) as { n: number };
  return fila.n > 0;
}

// Borrar una categoría la borra de verdad: si ya tiene gastos registrados,
// también se borran esos gastos (el llamador confirma esto con la persona
// antes de llegar aquí).
export function eliminarCategoria(id: string) {
  conTransaccion(() => {
    db.prepare('DELETE FROM gastos WHERE categoria_id = ?').run(id);
    db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
  });
}

// ---------- Presupuestos ----------

export type Presupuesto = { id: string; miembroId: string; periodo: string; monto: number };

export function presupuestoDeMiembro(miembroId: string, periodo: string): Presupuesto | undefined {
  return db
    .prepare('SELECT id, miembro_id as miembroId, periodo, monto FROM presupuestos WHERE miembro_id = ? AND periodo = ?')
    .get(miembroId, periodo) as Presupuesto | undefined;
}

export function listarPresupuestosDePeriodo(periodo: string): Presupuesto[] {
  return db
    .prepare('SELECT id, miembro_id as miembroId, periodo, monto FROM presupuestos WHERE periodo = ?')
    .all(periodo) as Presupuesto[];
}

export function asignarPresupuesto(miembroId: string, periodo: string, monto: number): Presupuesto {
  const existente = presupuestoDeMiembro(miembroId, periodo);
  if (existente) {
    db.prepare('UPDATE presupuestos SET monto = ? WHERE id = ?').run(monto, existente.id);
    return { ...existente, monto };
  }
  const id = randomUUID();
  db.prepare('INSERT INTO presupuestos (id, miembro_id, periodo, monto) VALUES (?, ?, ?, ?)').run(
    id,
    miembroId,
    periodo,
    monto
  );
  return { id, miembroId, periodo, monto };
}

// ---------- Gastos ----------

export type Gasto = {
  id: string;
  miembroId: string;
  miembroNombre: string;
  casaId: string;
  casaNombre: string;
  categoriaId: string;
  categoriaNombre: string;
  monto: number;
  fecha: string;
  nota: string | null;
  creadoEn: string;
};

const SELECT_GASTO = `
  SELECT g.id, g.miembro_id as miembroId, m.nombre as miembroNombre,
         g.casa_id as casaId, c.nombre as casaNombre,
         g.categoria_id as categoriaId, cat.nombre as categoriaNombre,
         g.monto, g.fecha, g.nota, g.creado_en as creadoEn
  FROM gastos g
  JOIN miembros m ON m.id = g.miembro_id
  JOIN casas c ON c.id = g.casa_id
  JOIN categorias cat ON cat.id = g.categoria_id
`;

export function listarGastos(filtros: { periodo?: string; casaId?: string; miembroId?: string } = {}): Gasto[] {
  const condiciones: string[] = [];
  const params: string[] = [];
  if (filtros.periodo) {
    condiciones.push("substr(g.fecha, 1, 7) = ?");
    params.push(filtros.periodo);
  }
  if (filtros.casaId) {
    condiciones.push('g.casa_id = ?');
    params.push(filtros.casaId);
  }
  if (filtros.miembroId) {
    condiciones.push('g.miembro_id = ?');
    params.push(filtros.miembroId);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return db.prepare(`${SELECT_GASTO} ${where} ORDER BY g.fecha DESC, g.creado_en DESC`).all(...params) as Gasto[];
}

export function buscarGastoPorId(id: string): Gasto | undefined {
  return db.prepare(`${SELECT_GASTO} WHERE g.id = ?`).get(id) as Gasto | undefined;
}

export function crearGasto(datos: {
  miembroId: string;
  casaId: string;
  categoriaId: string;
  monto: number;
  fecha: string;
  nota: string | null;
}): Gasto {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO gastos (id, miembro_id, casa_id, categoria_id, monto, fecha, nota)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, datos.miembroId, datos.casaId, datos.categoriaId, datos.monto, datos.fecha, datos.nota);
  return buscarGastoPorId(id)!;
}

export function editarGasto(
  id: string,
  datos: { casaId: string; categoriaId: string; monto: number; fecha: string; nota: string | null }
): Gasto {
  db.prepare(
    `UPDATE gastos SET casa_id = ?, categoria_id = ?, monto = ?, fecha = ?, nota = ?, actualizado_en = datetime('now')
     WHERE id = ?`
  ).run(datos.casaId, datos.categoriaId, datos.monto, datos.fecha, datos.nota, id);
  return buscarGastoPorId(id)!;
}

export function eliminarGasto(id: string) {
  db.prepare('DELETE FROM gastos WHERE id = ?').run(id);
}

// ---------- Reportes agregados ----------

export function gastadoPorMiembro(periodo: string): { miembroId: string; gastado: number }[] {
  return db
    .prepare(
      "SELECT miembro_id as miembroId, SUM(monto) as gastado FROM gastos WHERE substr(fecha,1,7) = ? GROUP BY miembro_id"
    )
    .all(periodo) as { miembroId: string; gastado: number }[];
}

export function reportePorCasa(periodo: string): { casaId: string; nombre: string; gastado: number }[] {
  return db
    .prepare(
      `SELECT c.id as casaId, c.nombre, COALESCE(SUM(g.monto), 0) as gastado
       FROM casas c
       LEFT JOIN gastos g ON g.casa_id = c.id AND substr(g.fecha,1,7) = ?
       GROUP BY c.id ORDER BY c.nombre ASC`
    )
    .all(periodo) as { casaId: string; nombre: string; gastado: number }[];
}

export function reportePorCategoria(periodo: string): { categoriaId: string; nombre: string; gastado: number }[] {
  return db
    .prepare(
      `SELECT cat.id as categoriaId, cat.nombre, COALESCE(SUM(g.monto), 0) as gastado
       FROM categorias cat
       LEFT JOIN gastos g ON g.categoria_id = cat.id AND substr(g.fecha,1,7) = ?
       GROUP BY cat.id
       HAVING gastado > 0
       ORDER BY gastado DESC`
    )
    .all(periodo) as { categoriaId: string; nombre: string; gastado: number }[];
}
