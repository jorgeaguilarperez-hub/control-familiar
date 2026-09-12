const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  detalles?: unknown;
  constructor(message: string, detalles?: unknown) {
    super(message);
    this.detalles = detalles;
  }
}

// El backend puede rechazar con 401 en cualquier momento, no solo por no
// tener cookie: por ejemplo, si la sesión se cerró por inactividad (ver
// requireAuth en el backend). AuthProvider se suscribe aquí para enterarse
// de inmediato y mandar a la persona de vuelta a la pantalla de passkey,
// venga la llamada que venga (no solo la del propio chequeo de sesión).
type AlSesionExpirada = () => void;
let alSesionExpirada: AlSesionExpirada | null = null;
export function enSesionExpirada(cb: AlSesionExpirada | null) {
  alSesionExpirada = cb;
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  // Ojo: el "Content-Type: application/json" solo se manda cuando SÍ hay
  // body. Fastify rechaza con 400 "Bad Request" cualquier petición (por
  // ejemplo un DELETE, que no lleva body) que declare ese content-type
  // pero venga con el cuerpo vacío -- eso es justo lo que rompía "Borrar".
  const headers: Record<string, string> = { ...((opciones.headers as Record<string, string>) || {}) };
  if (opciones.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE_URL}${ruta}`, {
    credentials: 'include',
    ...opciones,
    headers,
  });
  if (res.status === 401) alSesionExpirada?.();
  const esJson = res.headers.get('content-type')?.includes('application/json');
  const cuerpo = esJson ? await res.json() : null;
  if (!res.ok) throw new ApiError(cuerpo?.error || `Error ${res.status}`, cuerpo);
  return cuerpo as T;
}

export const api = {
  get: <T>(ruta: string) => pedir<T>(ruta),
  post: <T>(ruta: string, body?: unknown) => pedir<T>(ruta, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(ruta: string, body?: unknown) => pedir<T>(ruta, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(ruta: string, body?: unknown) => pedir<T>(ruta, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(ruta: string) => pedir<T>(ruta, { method: 'DELETE' }),
};

// ---------- Tipos ----------

export type Rol = 'admin' | 'miembro';

export type Casa = { id: string; nombre: string; activo: boolean; numGastos: number };
export type Categoria = { id: string; nombre: string; activo: boolean; numGastos: number };

export type Miembro = {
  id: string;
  nombre: string;
  // Una casa, varias, o (con todasLasCasas) todas -- ya no es una sola
  // casa fija. Cuando todasLasCasas es true, casaIds/casaNombres vienen
  // vacíos (no enumeran cada casa una por una).
  casaIds: string[];
  casaNombres: string[];
  todasLasCasas: boolean;
  rol: Rol;
  activo: boolean;
  // Un miembro normal puede marcarse a mano como "sin presupuesto" (por
  // ejemplo alguien de quien no se quiere llevar ese control) -- igual que
  // el administrador, no participa del desglose por persona en reportes.
  sinPresupuesto: boolean;
  enLinea: boolean;
  tienePasskey: boolean;
  numCredenciales: number;
  numGastos: number;
};

export type Credencial = { id: string; creadoEn: string; transports: string | null };

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

export type EstadoPresupuesto = 'ok' | 'aviso' | 'alerta';

export type ResumenMiembro = {
  miembroId: string;
  nombre: string;
  casaNombre: string | null;
  presupuesto: number | null;
  gastado: number;
  estado: EstadoPresupuesto;
};

export type Resumen = {
  periodo: string;
  porMiembro: ResumenMiembro[];
  porCasa: { casaId: string; nombre: string; gastado: number }[];
  porCategoria: { categoriaId: string; nombre: string; gastado: number }[];
};

export type TipoBitacora =
  | 'login_exitoso'
  | 'login_fallido'
  | 'registro_passkey'
  | 'passkey_agregada'
  | 'registro_fallido'
  | 'passkey_revocada'
  | 'logout'
  | 'cierre_por_inactividad'
  | 'miembro_creado'
  | 'miembro_editado'
  | 'miembro_borrado'
  | 'invitacion_generada'
  | 'casa_creada'
  | 'casa_editada'
  | 'casa_borrada'
  | 'categoria_creada'
  | 'categoria_editada'
  | 'categoria_borrada'
  | 'gasto_creado'
  | 'gasto_editado'
  | 'gasto_borrado'
  | 'presupuesto_asignado'
  | 'bitacora_borrada';

export type CategoriaBitacora = 'acceso' | 'operacion';
export type FiltroBitacora = 'todos' | 'acceso' | 'operacion';

export type EntradaBitacora = {
  id: string;
  creadoEn: string;
  miembroId: string | null;
  nombreActor: string;
  tipo: TipoBitacora;
  categoria: CategoriaBitacora;
  descripcion: string;
  ip: string | null;
  userAgent: string | null;
};

// ---------- Llamadas ----------

export const obtenerEstado = () => api.get<{ hayMiembros: boolean }>('/api/auth/estado');
// Se llama cuando se detecta una interacción real de la persona (clic,
// tecla, touch, scroll) mientras hay sesión -- es lo que evita que se
// cierre por inactividad (ver AuthProvider). No se llama en cada petición
// normal, solo desde ese conteo de inactividad.
export const marcarInteraccion = () => api.post<{ ok: true }>('/api/auth/actividad');

export const listarCasas = () => api.get<Casa[]>('/api/casas');
export const crearCasa = (nombre: string) => api.post<Casa>('/api/casas', { nombre });
export const editarCasa = (id: string, datos: Partial<{ nombre: string; activo: boolean }>) =>
  api.patch<Casa>(`/api/casas/${id}`, datos);
export const borrarCasa = (id: string) => api.del<{ ok: true; teniaGastos: boolean }>(`/api/casas/${id}`);

export const listarCategorias = () => api.get<Categoria[]>('/api/categorias');
export const crearCategoria = (nombre: string) => api.post<Categoria>('/api/categorias', { nombre });
export const editarCategoria = (id: string, datos: Partial<{ nombre: string; activo: boolean }>) =>
  api.patch<Categoria>(`/api/categorias/${id}`, datos);
export const borrarCategoria = (id: string) => api.del<{ ok: true; teniaGastos: boolean }>(`/api/categorias/${id}`);

export const listarMiembros = () => api.get<Miembro[]>('/api/miembros');
export const crearMiembro = (datos: { nombre: string; casaIds?: string[]; todasLasCasas?: boolean; rol?: Rol }) =>
  api.post<{ miembro: Miembro; invitacion: { token: string; ruta: string } }>('/api/miembros', datos);
export const editarMiembro = (
  id: string,
  datos: Partial<{ nombre: string; casaIds: string[]; todasLasCasas: boolean; rol: Rol; activo: boolean; sinPresupuesto: boolean }>
) => api.patch<Miembro>(`/api/miembros/${id}`, datos);
export const borrarMiembro = (id: string) => api.del<{ ok: true; teniaGastos: boolean }>(`/api/miembros/${id}`);
export const regenerarInvitacion = (id: string) =>
  api.post<{ invitacion: { token: string; ruta: string } }>(`/api/miembros/${id}/invitacion`);
export const listarCredenciales = (miembroId: string) => api.get<Credencial[]>(`/api/miembros/${miembroId}/credenciales`);
export const borrarCredencial = (miembroId: string, credencialId: string) =>
  api.del<{ ok: true }>(`/api/miembros/${miembroId}/credenciales/${credencialId}`);

export const obtenerPresupuestos = (periodo: string) =>
  api.get<{ id: string; miembroId: string; periodo: string; monto: number }[]>(`/api/presupuestos?periodo=${periodo}`);
export const asignarPresupuesto = (miembroId: string, periodo: string, monto: number) =>
  api.put(`/api/presupuestos`, { miembroId, periodo, monto });

export const listarGastos = (filtros: { periodo?: string; casaId?: string; miembroId?: string; categoriaId?: string } = {}) => {
  const params = new URLSearchParams();
  if (filtros.periodo) params.set('periodo', filtros.periodo);
  if (filtros.casaId) params.set('casaId', filtros.casaId);
  if (filtros.miembroId) params.set('miembroId', filtros.miembroId);
  if (filtros.categoriaId) params.set('categoriaId', filtros.categoriaId);
  const query = params.toString();
  return api.get<Gasto[]>(`/api/gastos${query ? `?${query}` : ''}`);
};
export const crearGasto = (datos: { casaId: string; categoriaId: string; monto: number; fecha: string; nota?: string }) =>
  api.post<Gasto>('/api/gastos', datos);
export const editarGasto = (id: string, datos: { casaId: string; categoriaId: string; monto: number; fecha: string; nota?: string }) =>
  api.patch<Gasto>(`/api/gastos/${id}`, datos);
export const borrarGasto = (id: string) => api.del<{ ok: true }>(`/api/gastos/${id}`);

export const obtenerResumen = (periodo: string) => api.get<Resumen>(`/api/reportes/resumen?periodo=${periodo}`);

export const listarBitacora = (opciones: { filtro?: FiltroBitacora; antesDe?: string; miembroId?: string; limite?: number } = {}) => {
  const params = new URLSearchParams();
  if (opciones.filtro) params.set('filtro', opciones.filtro);
  if (opciones.antesDe) params.set('antesDe', opciones.antesDe);
  if (opciones.miembroId) params.set('miembroId', opciones.miembroId);
  if (opciones.limite) params.set('limite', String(opciones.limite));
  const query = params.toString();
  return api.get<{ entradas: EntradaBitacora[]; hayMas: boolean; sospechosas: { ip: string; intentos: number }[] }>(
    `/api/bitacora${query ? `?${query}` : ''}`
  );
};
export const borrarBitacora = () => api.del<{ ok: true; eliminadas: number }>('/api/bitacora');
