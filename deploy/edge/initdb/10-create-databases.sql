-- Runs once, when postgres starts on an EMPTY data volume (docker-entrypoint-initdb.d).
-- Creates one database per service, owned by POSTGRES_USER. The names match the ConnectionStrings in docker-compose.yml.
-- All databases are created even when a service's compose profile is off, so a profile can be enabled later without
-- touching postgres. To add a database to a running server:  docker compose exec postgres createdb -U <user> <name>
CREATE DATABASE "CLINICEZ_CLINIC_DB";
CREATE DATABASE "CLINICEZ_BILLING_DB";
CREATE DATABASE "CLINICEZ_LABORATORY_DB";
CREATE DATABASE "CLINICEZ_PHARMACY_DB";
CREATE DATABASE "CLINICEZ_ORGANIZATION_DB";
CREATE DATABASE "CLINICEZ_INTEROP_HUB_LOCAL_DB";
