-- =========================================================================================
-- ClinicEz AuditEntries Monthly Declarative Range-Partitioning DDL
-- Database Engine: PostgreSQL 14+ (Optimized for PostgreSQL 17 / pgvector production cluster)
-- Partition Key: "Timestamp" (timestamptz)
-- =========================================================================================

BEGIN;

-- 1. Create the new partitioned table structure
CREATE TABLE IF NOT EXISTS "AuditEntries_Partitioned" (
    "Id" uuid NOT NULL,
    "TenantId" character varying(100) NOT NULL,
    "ClinicId" uuid NOT NULL,
    "Timestamp" timestamp with time zone NOT NULL,
    "Category" character varying(50) NOT NULL,
    "Severity" character varying(50) NOT NULL,
    "Action" character varying(100) NOT NULL,
    "ActorStaffId" uuid,
    "ActorName" character varying(150) NOT NULL,
    "ActorRole" character varying(100) NOT NULL,
    "ClientIpAddress" character varying(50),
    "UserAgent" character varying(500),
    "TargetEntityType" character varying(100) NOT NULL,
    "TargetEntityId" character varying(100),
    "PatientId" uuid,
    "PatientNameMasked" character varying(150),
    "PatientPinMasked" character varying(50),
    "Outcome" character varying(50) NOT NULL,
    "Description" character varying(1000) NOT NULL,
    "MetadataJson" text,
    CONSTRAINT "PK_AuditEntries_Partitioned" PRIMARY KEY ("Id", "Timestamp")
) PARTITION BY RANGE ("Timestamp");

-- 2. Define Monthly Partitions for 2026
CREATE TABLE IF NOT EXISTS "audit_entries_y2026m01" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2026m02" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2026m03" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2026m04" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2026m05" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2026m06" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2026m07" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2026m08" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2026m09" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2026m10" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2026m11" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2026m12" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

-- 3. Define Monthly Partitions for 2027
CREATE TABLE IF NOT EXISTS "audit_entries_y2027m01" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2027m02" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2027m03" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2027m04" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2027m05" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2027-05-01 00:00:00+00') TO ('2027-06-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_entries_y2027m06" PARTITION OF "AuditEntries_Partitioned"
    FOR VALUES FROM ('2027-06-01 00:00:00+00') TO ('2027-07-01 00:00:00+00');

-- Catch-all default partition for overflow protection
CREATE TABLE IF NOT EXISTS "audit_entries_default" PARTITION OF "AuditEntries_Partitioned" DEFAULT;

-- 4. Global Partitioned Indexes (Automatically propagated to child partitions)
CREATE INDEX IF NOT EXISTS "IX_AuditEntries_Tenant_Clinic_Timestamp"
    ON "AuditEntries_Partitioned" ("TenantId", "ClinicId", "Timestamp" DESC);

CREATE INDEX IF NOT EXISTS "IX_AuditEntries_Clinic_Category_Timestamp"
    ON "AuditEntries_Partitioned" ("ClinicId", "Category", "Timestamp" DESC);

CREATE INDEX IF NOT EXISTS "IX_AuditEntries_Clinic_Severity_Timestamp"
    ON "AuditEntries_Partitioned" ("ClinicId", "Severity", "Timestamp" DESC);

CREATE INDEX IF NOT EXISTS "IX_AuditEntries_Clinic_ActorStaffId_Timestamp"
    ON "AuditEntries_Partitioned" ("ClinicId", "ActorStaffId", "Timestamp" DESC);

CREATE INDEX IF NOT EXISTS "IX_AuditEntries_Clinic_PatientId_Timestamp"
    ON "AuditEntries_Partitioned" ("ClinicId", "PatientId", "Timestamp" DESC);

CREATE INDEX IF NOT EXISTS "IX_AuditEntries_Clinic_Target"
    ON "AuditEntries_Partitioned" ("ClinicId", "TargetEntityType", "TargetEntityId");

-- 5. Stored Procedure for Automatic Monthly Partition Creation
CREATE OR REPLACE FUNCTION create_audit_entries_monthly_partition(target_date timestamptz)
RETURNS text AS $$
DECLARE
    start_date date := date_trunc('month', target_date)::date;
    end_date date := (start_date + INTERVAL '1 month')::date;
    partition_name text := 'audit_entries_y' || to_char(start_date, 'YYYY') || 'm' || to_char(start_date, 'MM');
    sql text;
BEGIN
    sql := format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF "AuditEntries_Partitioned" FOR VALUES FROM (%L) TO (%L);',
        partition_name,
        start_date::timestamptz,
        end_date::timestamptz
    );
    EXECUTE sql;
    RETURN partition_name;
END;
$$ LANGUAGE plpgsql;

-- 6. Zero-Downtime Migration / Cutover Script (Run when migrating an existing non-partitioned AuditEntries table)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = current_schema() 
          AND table_name = 'AuditEntries' 
          AND table_type = 'BASE TABLE'
    ) THEN
        -- Verify if AuditEntries is already partitioned
        IF NOT EXISTS (
            SELECT 1 FROM pg_partitioned_table pt
            JOIN pg_class c ON c.oid = pt.partrelid
            WHERE c.relname = 'AuditEntries'
        ) THEN
            -- Copy existing records into partitioned table
            INSERT INTO "AuditEntries_Partitioned" (
                "Id", "TenantId", "ClinicId", "Timestamp", "Category", "Severity",
                "Action", "ActorStaffId", "ActorName", "ActorRole", "ClientIpAddress",
                "UserAgent", "TargetEntityType", "TargetEntityId", "PatientId",
                "PatientNameMasked", "PatientPinMasked", "Outcome", "Description", "MetadataJson"
            )
            SELECT
                "Id", "TenantId", "ClinicId", "Timestamp", "Category", "Severity",
                "Action", "ActorStaffId", "ActorName", "ActorRole", "ClientIpAddress",
                "UserAgent", "TargetEntityType", "TargetEntityId", "PatientId",
                "PatientNameMasked", "PatientPinMasked", "Outcome", "Description", "MetadataJson"
            FROM "AuditEntries"
            ON CONFLICT DO NOTHING;

            -- Rename legacy table and promote partitioned table
            ALTER TABLE "AuditEntries" RENAME TO "AuditEntries_Legacy_Unpartitioned";
            ALTER TABLE "AuditEntries_Partitioned" RENAME TO "AuditEntries";
        END IF;
    ELSE
        -- Fresh install: promote partitioned table directly
        ALTER TABLE "AuditEntries_Partitioned" RENAME TO "AuditEntries";
    END IF;
END $$;

COMMIT;
