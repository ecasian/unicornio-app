BEGIN;
ALTER TABLE "UsuarioInterno" ADD COLUMN username varchar(40), ALTER COLUMN email DROP NOT NULL;
CREATE UNIQUE INDEX "UsuarioInterno_username_key" ON "UsuarioInterno"(username);
DO $$
DECLARE r record; stem text; candidate text; attempt int; suffix text;
BEGIN
  FOR r IN SELECT id,email FROM "UsuarioInterno" ORDER BY id LOOP
    stem := left(regexp_replace(lower(split_part(r.email,'@',1) COLLATE "C"), '[^a-z0-9._-]', '', 'g'),40);
    IF length(stem)<3 THEN stem := 'usuario-' || r.id; END IF;
    candidate := stem;
    attempt := 0;
    WHILE EXISTS (SELECT 1 FROM "UsuarioInterno" WHERE username=candidate) LOOP
      attempt := attempt+1;
      suffix := '-' || r.id || CASE WHEN attempt=1 THEN '' ELSE '-' || attempt END;
      candidate := left(stem,40-length(suffix)) || suffix;
    END LOOP;
    UPDATE "UsuarioInterno" SET username=candidate WHERE id=r.id;
  END LOOP;
END $$;
ALTER TABLE "UsuarioInterno" ALTER COLUMN username SET NOT NULL,
  ADD CONSTRAINT usuario_username_canonico CHECK (username COLLATE "C" ~ '^[a-z0-9._-]{3,40}$');
COMMIT;
