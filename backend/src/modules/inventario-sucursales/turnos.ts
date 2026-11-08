import { TurnoInventarioSucursal } from '@prisma/client';

export const HORARIOS_POR_SUCURSAL: Readonly<Record<string, Readonly<Record<TurnoInventarioSucursal, string>>>> = {
  carranza: { MATUTINO: '08:00–14:30', VESPERTINO: '16:30–21:00' },
  ayuntamiento: { MATUTINO: '08:00–14:30', VESPERTINO: '16:30–21:00' },
  colibri: { MATUTINO: '08:00–14:30', VESPERTINO: '16:30–21:00' },
  'villa centro': { MATUTINO: '08:00–14:30', VESPERTINO: '16:30–21:00' },
  'san fernando': { MATUTINO: '10:00–16:00', VESPERTINO: '16:00–22:00' },
};

export function horarioSucursal(nombre: string) {
  const key = nombre.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase('es-MX');
  return HORARIOS_POR_SUCURSAL[key] ?? null;
}
