import { describe, expect, it } from 'vitest';
import { clasificarEstadoTemporalLote } from './yogurt-base.service.js';

describe('YogurtBase temporal lot status', () => {
  it.each([
    [0, 'PROCESAMIENTO_NORMAL'],
    [1, 'PROCESAMIENTO_NORMAL'],
    [2, 'PROCESAMIENTO_OBLIGATORIO'],
    [3, 'LIMITE_EXCEDIDO_REQUIERE_REVISION'],
  ] as const)('classifies pending base at D+%i', (age, expected) => {
    expect(clasificarEstadoTemporalLote(age, 1)).toBe(expected);
  });

  it.each([2, 3])('does not show an overdue action for exhausted lots at D+%i', (age) => {
    expect(clasificarEstadoTemporalLote(age, 0)).toBe('PROCESADO');
  });
});
