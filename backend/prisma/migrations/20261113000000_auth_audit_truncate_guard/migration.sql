CREATE TRIGGER "EventoAuditoria_append_only_truncate"
BEFORE TRUNCATE ON "EventoAuditoria"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_event_mutation();
