-- Read-only role for the public core. Run as the owner after migrations;
-- psql variable :'password' supplies the secret without echoing it.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cla_public') THEN CREATE ROLE cla_public LOGIN; END IF;
END $$;
ALTER ROLE cla_public PASSWORD :'password';
ALTER ROLE cla_public SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE arkhiv TO cla_public;
GRANT USAGE ON SCHEMA public TO cla_public;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cla_public;
ALTER DEFAULT PRIVILEGES FOR ROLE arkhiv IN SCHEMA public GRANT SELECT ON TABLES TO cla_public;
