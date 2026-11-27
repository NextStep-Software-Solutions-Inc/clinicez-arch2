-- ============================================================================
-- Clinic EZ v1 -> v2 Indefinite Sync: Clean Teardown of `_v1_sync` CDC Schema
-- ============================================================================
-- Removes every `trg_v1_sync_capture` trigger attached to `public.*` tables
-- and drops the entire `_v1_sync` schema cleanly. Safe to re-run.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_rec RECORD;
BEGIN
    FOR v_rec IN
        SELECT DISTINCT c.relname AS tbl
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND t.tgname = 'trg_v1_sync_capture'
          AND NOT t.tgisinternal
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_v1_sync_capture ON public.%I', v_rec.tbl);
    END LOOP;
END;
$$;

DROP SCHEMA IF EXISTS _v1_sync CASCADE;

COMMIT;
