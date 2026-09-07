// Umbrales de alerta de presupuesto -- ajustables aquí sin tocar el resto
// del código (Jorge los dejó en 80% / 100% por default).
export const UMBRAL_AVISO = 0.8;
export const UMBRAL_ALERTA = 1.0;

export type EstadoPresupuesto = 'ok' | 'aviso' | 'alerta';

export function estadoDePresupuesto(gastado: number, presupuesto: number | null): EstadoPresupuesto {
  if (!presupuesto || presupuesto <= 0) return 'ok';
  const proporcion = gastado / presupuesto;
  if (proporcion >= UMBRAL_ALERTA) return 'alerta';
  if (proporcion >= UMBRAL_AVISO) return 'aviso';
  return 'ok';
}

export function periodoActual(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}
