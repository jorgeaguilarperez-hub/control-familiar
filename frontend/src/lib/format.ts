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
