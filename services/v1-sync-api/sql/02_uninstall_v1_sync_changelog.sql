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
        SELECT event_object_table AS tbl
        FROM information_schema.triggers
        WHERE (trigger_schema = 'public' OR event_object_schema = 'public')
          AND trigger_name = 'trg_v1_sync_capture'
        GROUP BY event_object_table
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_v1_sync_capture ON public.%I', v_rec.tbl);
    END LOOP;
END;
$$;

DROP SCHEMA IF EXISTS _v1_sync CASCADE;

COMMIT;
