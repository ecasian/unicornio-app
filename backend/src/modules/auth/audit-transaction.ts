import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';

export type AuditRequestContext = {
  requestId: string;
  route: string;
  method: string;
  actorUserId?: number;
};

const contextStorage = new AsyncLocalStorage<AuditRequestContext>();

export function runWithAuditRequestContext<T>(context: AuditRequestContext, callback: () => T): T {
  return contextStorage.run(context, callback);
}

export function setAuditActor(actorUserId: number): void {
  const context = contextStorage.getStore();
  if (context) context.actorUserId = actorUserId;
}

/** Persists the HTTP success terminal in the same PostgreSQL transaction as the business mutation. */
export async function recordMutationSucceededInTransaction(transaction: Prisma.TransactionClient): Promise<void> {
  const context = contextStorage.getStore();
  if (!context) return;
  await transaction.eventoAuditoria.create({
    data: {
      actorUsuarioId: context.actorUserId,
      accion: 'MUTATION_SUCCEEDED',
      ruta: context.route,
      metodo: context.method,
      resultado: 'SUCCESS',
      requestId: context.requestId,
      metadata: { committedWithBusinessTransaction: true },
    },
  });
}
