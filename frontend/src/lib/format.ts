const moneda = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export function formatMoney(n: number): string {
  return moneda.format(n);
}

export function hoyISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function periodoActualISO(): string {
  return hoyISO().slice(0, 7);
}

export function formatPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  const texto = new Date(anio, mes - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function formatDate(iso: string): string {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

// "hace 2 min", "hace 3 h" -- para el indicador de presencia. sqliteUtc
// llega como 'YYYY-MM-DD HH:MM:SS' en UTC (sin sufijo de zona).
export function formatearRelativo(sqliteUtc: string): string {
  const iso = sqliteUtc.includes('T') ? sqliteUtc : `${sqliteUtc.replace(' ', 'T')}Z`;
  const segundos = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (segundos < 60) return 'justo ahora';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

function aFechaLocal(sqliteUtc: string): Date {
  const iso = sqliteUtc.includes('T') ? sqliteUtc : `${sqliteUtc.replace(' ', 'T')}Z`;
  return new Date(iso);
}

// Fecha y hora completas -- para la bitácora, donde sí importa el momento
// exacto (a diferencia de "hace 2 min", que basta en la mayoría del resto
// de la app).
export function formatDateTime(sqliteUtc: string): string {
  return aFechaLocal(sqliteUtc).toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function esMismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Clave de agrupación por día (en la zona horaria de quien lo ve, no UTC)
// -- para juntar bajo un mismo encabezado todas las entradas de la
// bitácora de un mismo día.
export function claveDia(sqliteUtc: string): string {
  const d = aFechaLocal(sqliteUtc);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function formatearEncabezadoFecha(sqliteUtc: string): string {
  const d = aFechaLocal(sqliteUtc);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);

  if (esMismoDia(d, hoy)) return 'Hoy';
  if (esMismoDia(d, ayer)) return 'Ayer';

  const texto = d.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() !== hoy.getFullYear() ? 'numeric' : undefined,
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// "iPhone · Safari", "Android · Chrome" -- para la bitácora, sin depender
// de ninguna librería: solo mira las cadenas más comunes del user-agent.
export function formatearDispositivo(userAgent: string | null): string {
  if (!userAgent) return 'Desconocido';

  let so = 'Escritorio';
  if (/iPhone/i.test(userAgent)) so = 'iPhone';
  else if (/iPad/i.test(userAgent)) so = 'iPad';
  else if (/Android/i.test(userAgent)) so = 'Android';
  else if (/Macintosh|Mac OS X/i.test(userAgent)) so = 'Mac';
  else if (/Windows/i.test(userAgent)) so = 'Windows';
  else if (/Linux/i.test(userAgent)) so = 'Linux';

  let navegador = '';
  if (/EdgA|Edg\//i.test(userAgent)) navegador = 'Edge';
  else if (/CriOS|Chrome\//i.test(userAgent)) navegador = 'Chrome';
  else if (/FxiOS|Firefox\//i.test(userAgent)) navegador = 'Firefox';
  else if (/Safari\//i.test(userAgent)) navegador = 'Safari';

  return navegador ? `${so} · ${navegador}` : so;
}
