import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports that the API is available', () => {
    const controller = new HealthController();
    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });
});
