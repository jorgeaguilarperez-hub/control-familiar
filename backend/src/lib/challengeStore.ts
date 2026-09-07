// Almacén temporal en memoria para retos (challenges) de WebAuthn mientras
// el navegador completa el flujo de registro o autenticación. Suficiente
// para un sistema pequeño de una familia; si el servidor se reinicia a
// mitad de un intento, la persona simplemente lo repite.

type Entrada = { challenge: string; creadoEn: number };

const store = new Map<string, Entrada>();
const TTL_MS = 5 * 60 * 1000; // 5 minutos

function limpiar() {
  const ahora = Date.now();
  for (const [clave, entrada] of store) {
    if (ahora - entrada.creadoEn > TTL_MS) store.delete(clave);
  }
}

export function guardarChallenge(clave: string, challenge: string) {
  limpiar();
  store.set(clave, { challenge, creadoEn: Date.now() });
}

export function tomarChallenge(clave: string): Entrada | undefined {
  const entrada = store.get(clave);
  store.delete(clave);
  return entrada;
}
