-- Rol de la aplicación sin superusuario (dentview_app). Idempotente: se puede correr cuantas veces se quiera.
-- Debe ejecutarlo el dueño de las tablas (el usuario de migraciones, p. ej. dentview). La clave del rol NO va aquí:
--   ALTER ROLE dentview_app PASSWORD '...';   (init-rol-app.sh lo hace en instalaciones nuevas; ver README)
-- El contenedor web lo vuelve a aplicar después de cada `prisma migrate deploy` (tablas nuevas y "Evento").
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dentview_app') THEN
    CREATE ROLE dentview_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

-- Solo datos: nada de DDL (CREATE en public ya está revocado a PUBLIC desde Postgres 15).
GRANT USAGE ON SCHEMA public TO dentview_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dentview_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dentview_app;
-- Tablas y secuencias que creen las migraciones futuras (las crea el rol que corre este script).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dentview_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dentview_app;

DO $$
DECLARE
  tabla text;
BEGIN
  -- Bitácora inmutable: la app solo inserta y lee eventos.
  -- (Los ON DELETE CASCADE / SET NULL de sus llaves foráneas corren con permisos del dueño y siguen funcionando.)
  IF to_regclass('public."Evento"') IS NOT NULL THEN
    REVOKE UPDATE, DELETE ON TABLE public."Evento" FROM dentview_app;
  END IF;
  -- Historia clínica y kardex inmutables (Res. 1995/1999; conservación 15 años): solo INSERT y SELECT.
  -- Las correcciones son adendas / movimientos compensatorios / notas crédito.
  FOREACH tabla IN ARRAY ARRAY['EvolucionClinica', 'AdendaEvolucion', 'AdjuntoEvolucion', 'RegistroToma', 'MovimientoInventario', 'NotaCredito'] LOOP
    IF to_regclass(format('public.%I', tabla)) IS NOT NULL THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON TABLE public.%I FROM dentview_app', tabla);
    END IF;
  END LOOP;
  -- El historial de migraciones no es asunto de la app.
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM dentview_app;
  END IF;
END $$;
