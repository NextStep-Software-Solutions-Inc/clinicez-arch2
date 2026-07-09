CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;
DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'main') THEN
        CREATE SCHEMA main;
    END IF;
END $EF$;

CREATE TABLE main."ExampleEntities" (
    "Id" uuid NOT NULL DEFAULT (gen_random_uuid()),
    "Name" text NOT NULL,
    "Description" text,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" text NOT NULL,
    "UpdatedAt" timestamp with time zone,
    "UpdatedBy" text,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    "DeletedBy" text,
    CONSTRAINT "PK_ExampleEntities" PRIMARY KEY ("Id")
);

CREATE TABLE main."Tenants" (
    "Id" uuid NOT NULL DEFAULT (gen_random_uuid()),
    "OwnerId" text NOT NULL,
    "ClinicName" text NOT NULL,
    "TenantSlug" text NOT NULL,
    "FacilityType" text NOT NULL,
    "FirstName" text NOT NULL,
    "LastName" text NOT NULL,
    "Email" text NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" text NOT NULL,
    "UpdatedAt" timestamp with time zone,
    "UpdatedBy" text,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    "DeletedBy" text,
    CONSTRAINT "PK_Tenants" PRIMARY KEY ("Id")
);

CREATE UNIQUE INDEX "IX_ExampleEntities_Name" ON main."ExampleEntities" ("Name");

CREATE UNIQUE INDEX "IX_Tenants_TenantSlug" ON main."Tenants" ("TenantSlug");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260709160641_Initial', '10.0.9');

COMMIT;

START TRANSACTION;
ALTER TABLE main."Tenants" ADD "SubscriptionId" text NOT NULL DEFAULT '';

ALTER TABLE main."Tenants" ADD "SubscriptionPlanId" text NOT NULL DEFAULT '';

ALTER TABLE main."Tenants" ADD "SubscriptionStatus" text NOT NULL DEFAULT '';

ALTER TABLE main."Tenants" ADD "XenditCustomerId" text NOT NULL DEFAULT '';

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260709192544_AddXenditSubscriptionFields', '10.0.9');

COMMIT;

