import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../db/prisma.service.js';
import { AuthService } from './auth.service.js';

function serviceWith(transaction: Record<string, unknown>) {
  const prismaTransaction = transaction as unknown as Prisma.TransactionClient;
  const prisma = {
    $transaction: vi.fn((callback: (tx: Prisma.TransactionClient) => unknown) => callback(prismaTransaction)),
  } as unknown as PrismaService;
  const config = { get: vi.fn(() => 'http://127.0.0.1:4173') };
  return { auth: new AuthService(prisma, config as never), prisma };
}

const lastAdmin = {
  id: 1,
  activo: true,
  repartidorId: null,
  roles: [{ rol: { codigo: 'ADMIN_GENERAL' } }],
};

describe('protección del administrador general', () => {
  it('serializa el cambio y evita desactivar al último administrador activo', async () => {
    const transaction = {
      $executeRaw: vi.fn(),
      usuarioInterno: { findUnique: vi.fn().mockResolvedValue(lastAdmin), count: vi.fn().mockResolvedValue(1), update: vi.fn() },
      sesion: { updateMany: vi.fn() },
      eventoAuditoria: { create: vi.fn() },
    };
    const { auth } = serviceWith(transaction);

    await expect(auth.setUserActive(1, false, 1)).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.usuarioInterno.update).not.toHaveBeenCalled();
    expect(transaction.eventoAuditoria.create).not.toHaveBeenCalled();
  });

  it('evita quitar el rol del último administrador activo', async () => {
    const transaction = {
      $executeRaw: vi.fn(),
      rol: { findMany: vi.fn().mockResolvedValue([{ id: 2, codigo: 'ADMIN_SUCURSALES' }]) },
      usuarioInterno: { findUnique: vi.fn().mockResolvedValue(lastAdmin), count: vi.fn().mockResolvedValue(1) },
      usuarioRol: { deleteMany: vi.fn(), createMany: vi.fn() },
      sesion: { updateMany: vi.fn() },
      eventoAuditoria: { create: vi.fn() },
    };
    const { auth } = serviceWith(transaction);

    await expect(auth.setUserRoles(1, ['ADMIN_SUCURSALES'], 1)).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.usuarioRol.deleteMany).not.toHaveBeenCalled();
    expect(transaction.eventoAuditoria.create).not.toHaveBeenCalled();
  });

  it('desactivar un usuario revoca sus sesiones y conserva el evento del actor', async () => {
    const transaction = {
      $executeRaw: vi.fn(),
      usuarioInterno: { findUnique: vi.fn().mockResolvedValue({ ...lastAdmin, roles: [{ rol: { codigo: 'OPERADOR_PRODUCCION' } }] }), update: vi.fn().mockResolvedValue({ id: 2, activo: false }) },
      count: vi.fn(),
      sesion: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      eventoAuditoria: { create: vi.fn().mockResolvedValue({}) },
    };
    const { auth } = serviceWith(transaction);

    await expect(auth.setUserActive(2, false, 7)).resolves.toEqual({ id: 2, activo: false });
    expect(transaction.sesion.updateMany).toHaveBeenCalledWith({ where: { usuarioId: 2, revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(transaction.eventoAuditoria.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUsuarioId: 7, accion: 'USER_ACTIVE_CHANGED' }) }));
  });

  it('rechaza asociar un Repartidor arbitrario a un usuario sin ese rol', async () => {
    const transaction = {
      $executeRaw: vi.fn(),
      rol: { findMany: vi.fn().mockResolvedValue([{ id: 1, codigo: 'ADMIN_GENERAL' }]) },
      repartidor: { findUnique: vi.fn() },
      usuarioInterno: { create: vi.fn() },
      eventoAuditoria: { create: vi.fn() },
    };
    const { auth } = serviceWith(transaction);
    await expect(auth.createUser({ nombre: 'Admin', email: 'admin@example.invalid', password: 'long-enough-test-password', roles: ['ADMIN_GENERAL'], repartidorId: 123 }, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.repartidor.findUnique).not.toHaveBeenCalled();
    expect(transaction.usuarioInterno.create).not.toHaveBeenCalled();
  });

  it('solo asigna el rol Repartidor a una persona activa existente', async () => {
    const transaction = {
      $executeRaw: vi.fn(),
      rol: { findMany: vi.fn().mockResolvedValue([{ id: 3, codigo: 'REPARTIDOR' }]) },
      repartidor: { findUnique: vi.fn().mockResolvedValue({ id: 5, activo: false }) },
      usuarioInterno: { create: vi.fn() },
      eventoAuditoria: { create: vi.fn() },
    };
    const { auth } = serviceWith(transaction);
    await expect(auth.createUser({ nombre: 'Repartidor', email: 'rep@example.invalid', password: 'long-enough-test-password', roles: ['REPARTIDOR'], repartidorId: 5 }, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.usuarioInterno.create).not.toHaveBeenCalled();
  });
});
