import jwt from 'jsonwebtoken';

const SECRET = process.env.SESSION_SECRET || 'dev-secret-cambia-esto';
const COOKIE_NAME = 'session';
const MAX_AGE_SEGUNDOS = 60 * 60 * 24 * 30; // 30 días

export type SesionPayload = {
  miembroId: string;
  nombre: string;
  rol: 'admin' | 'miembro';
};

export function firmarSesion(payload: SesionPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: MAX_AGE_SEGUNDOS });
}

export function verificarSesion(token: string): SesionPayload | null {
  try {
    return jwt.verify(token, SECRET) as SesionPayload;
  } catch {
    return null;
  }
}

export const COOKIE = {
  name: COOKIE_NAME,
  maxAge: MAX_AGE_SEGUNDOS,
};
