import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { ClientesService } from './clientes.service.js';
import { CreateClienteDto } from './dto/create-cliente.dto.js';
import { UpdateClienteDto } from './dto/update-cliente.dto.js';
import type { PrismaService } from '../../db/prisma.service.js';

const input = { nombre: 'Punto Fresco', celular: '3121234567', direccion: 'Av. Ejemplo 123', manejaMedioLitro: true };
const saved = { id: 1, ...input, activo: true, createdAt: new Date(), updatedAt: new Date() };

function setup() {
  const cliente = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
  const service = new ClientesService({ cliente } as unknown as PrismaService);
  return { cliente, service };
}

describe('ClientesService', () => {
  it('creates an active client', async () => {
    const { cliente, service } = setup();
    cliente.create.mockResolvedValue(saved);
    await expect(service.create(input)).resolves.toEqual(saved);
    expect(cliente.create).toHaveBeenCalledWith({ data: { ...input, activo: true } });
  });

  it('rejects invalid creation data and unknown properties', async () => {
    const dto = plainToInstance(CreateClienteDto, { ...input, nombre: '  ', celular: '', manejaMedioLitro: 'true' });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['nombre', 'celular', 'manejaMedioLitro']));
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    await expect(pipe.transform({ ...input, activo: false }, { type: 'body', metatype: CreateClienteDto })).rejects.toThrow();
  });

  it('rejects null and invalid booleans while editing', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    await expect(pipe.transform({ activo: null }, { type: 'body', metatype: UpdateClienteDto })).rejects.toThrow();
    await expect(pipe.transform({ manejaMedioLitro: 'false' }, { type: 'body', metatype: UpdateClienteDto })).rejects.toThrow();
  });

  it('lists all clients and filters by active state', async () => {
    const { cliente, service } = setup();
    cliente.findMany.mockResolvedValue([saved]);
    await expect(service.list()).resolves.toEqual([saved]);
    expect(cliente.findMany).toHaveBeenCalledWith({ where: undefined, orderBy: { id: 'asc' } });
    await service.list(false);
    expect(cliente.findMany).toHaveBeenLastCalledWith({ where: { activo: false }, orderBy: { id: 'asc' } });
  });

  it('gets an existing client', async () => {
    const { cliente, service } = setup();
    cliente.findUnique.mockResolvedValue(saved);
    await expect(service.get(1)).resolves.toEqual(saved);
  });

  it('returns 404 for a missing client', async () => {
    const { cliente, service } = setup();
    cliente.findUnique.mockResolvedValue(null);
    await expect(service.get(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates a client without replacing unspecified fields', async () => {
    const { cliente, service } = setup();
    cliente.findUnique.mockResolvedValue(saved);
    cliente.update.mockResolvedValue({ ...saved, nombre: 'Nuevo nombre', activo: false });
    const update: UpdateClienteDto = { nombre: 'Nuevo nombre', activo: false };
    await expect(service.update(1, update)).resolves.toMatchObject(update);
    expect(cliente.update).toHaveBeenCalledWith({ where: { id: 1 }, data: update });
  });
});
