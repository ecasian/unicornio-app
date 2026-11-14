CREATE UNIQUE INDEX "EventoAuditoria_requestId_terminal_key"
ON "EventoAuditoria" ("requestId")
WHERE "requestId" IS NOT NULL
  AND "accion" IN ('MUTATION_SUCCEEDED', 'MUTATION_FAILED');
