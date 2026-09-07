import { listarCategorias, crearCategoria } from './db.js';

// Al primer arranque (base de datos vacía) se siembran categorías por
// default, editables después desde el panel de admin.
const CATEGORIAS_DEFAULT = ['Comida', 'Servicios', 'Mantenimiento', 'Transporte', 'Otros'];

export function sembrarCategoriasIniciales(): string[] {
  if (listarCategorias().length > 0) return [];
  const mensajes: string[] = [];
  for (const nombre of CATEGORIAS_DEFAULT) {
    crearCategoria(nombre);
    mensajes.push(`Categoría creada: ${nombre}`);
  }
  return mensajes;
}
