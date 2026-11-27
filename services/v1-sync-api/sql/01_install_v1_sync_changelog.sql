-- ============================================================================
-- Clinic EZ v1 -> v2 Indefinite Sync: Non-Intrusive CDC Changelog Schema
-- ============================================================================
-- Installs an isolated `_v1_sync` schema (invisible to Prisma's `public` schema)
-- with an append-only `_v1_sync.changelog` table and lightweight AFTER triggers
-- on all 65 v1 source tables tracked by Track 1 (clinic-api) & Track 2 (patient-api).
--
-- SAFETY:
--   * Idempotent (safe to re-run).
--   * Zero alterations to any table structure in `public`.
--   * Zero PHI stored in `_v1_sync.changelog` — only table name, operation,
--     primary key `id`, and foreign-key routing IDs (`userId`, `clinicId`, etc.).
--   * Reversible in 1 step via `02_uninstall_v1_sync_changelog.sql`.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS _v1_sync;

CREATE TABLE IF NOT EXISTS _v1_sync.changelog (
    seq         BIGSERIAL   PRIMARY KEY,
    table_name  TEXT        NOT NULL,
    op          CHAR(1)     NOT NULL CHECK (op IN ('I', 'U', 'D')),
    row_id      TEXT        NOT NULL,
    pk_json     JSONB       NOT NULL,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_v1_sync_changelog_seq_table
    ON _v1_sync.changelog (table_name, seq);

CREATE INDEX IF NOT EXISTS ix_v1_sync_changelog_changed_at
    ON _v1_sync.changelog (changed_at);

CREATE OR REPLACE FUNCTION _v1_sync.capture_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_op      CHAR(1);
    v_payload JSONB;
    v_row_id  TEXT;
    v_meta    JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_op := 'I';
        v_payload := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        -- Skip no-op updates where nothing actually changed
        IF NEW IS NOT DISTINCT FROM OLD THEN
            RETURN NEW;
        END IF;
        v_op := 'U';
        v_payload := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_op := 'D';
        v_payload := to_jsonb(OLD);
    ELSE
        RETURN NULL;
    END IF;

    v_row_id := COALESCE(v_payload ->> 'id', '');

    -- Store ONLY non-PHI routing keys (IDs) so CDC poller can scope events safely
    v_meta := jsonb_strip_nulls(jsonb_build_object(
        'id', v_payload -> 'id',
        'userId', v_payload -> 'userId',
        'patientId', v_payload -> 'patientId',
        'clinicId', v_payload -> 'clinicId',
        'organizationId', v_payload -> 'organizationId',
        'clinicPatientId', v_payload -> 'clinicPatientId',
        'appointmentId', v_payload -> 'appointmentId',
        'consultationTicketId', v_payload -> 'consultationTicketId',
        'prescriptionId', v_payload -> 'prescriptionId',
        'medicineId', v_payload -> 'medicineId',
        'medicationId', v_payload -> 'medicationId',
        'fileId', v_payload -> 'fileId',
        'folderId', v_payload -> 'folderId',
        'fileSettingId', v_payload -> 'fileSettingId',
        'folderSettingId', v_payload -> 'folderSettingId',
        'orgMemberId', v_payload -> 'orgMemberId',
        'scopeClinicId', v_payload -> 'scopeClinicId',
        'clinicLaboratoryRequestId', v_payload -> 'clinicLaboratoryRequestId',
        'clinicImagingRequestId', v_payload -> 'clinicImagingRequestId',
        'clinicHeartStationRequestId', v_payload -> 'clinicHeartStationRequestId',
        'philHealthRecordId', v_payload -> 'philHealthRecordId'
    ));

    INSERT INTO _v1_sync.changelog (table_name, op, row_id, pk_json)
    VALUES (TG_TABLE_NAME, v_op, v_row_id, v_meta);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        -- Identity, Demographics, Org & Clinic Membership
        'User',
        'UserPreference',
        'UserAddress',
        'UserEmergencyContact',
        'ClinicPatient',
        'OrganizationMember',
        'UserStudentRecord',
        'UserEmploymentRecord',
        'PhilHealthRecord',
        'PhilHealthDependent',
        'OrganizationCollege',
        'OrganizationProgram',
        'OrganizationDepartment',
        'OrganizationOffice',
        'OrganizationYearLevel',
        -- Clinical Profile & Histories
        'UserAllergy',
        'UserHealthCondition',
        'MedicalHistory',
        'FamilyMedicalHistory',
        'PersonalHistory',
        'ObGyneHistory',
        'SurgicalHistory',
        'UserVaccination',
        'PatientImmunization',
        'UserDisability',
        'PatientInsight',
        'PatientNcdQuestionnaire',
        -- Visit Spine (Appointments, Pre-Assessments, Consultations, Notes, Vitals, Systems)
        'Appointment',
        'AppointmentAttribute',
        'AppointmentRequester',
        'AppointmentAttachment',
        'AppointmentRouting',
        'AppointmentTag',
        'PreAssessmentNote',
        'ConsultationTicket',
        'ConsultationTicketAttribute',
        'ConsultationTicketHP',
        'ConsultationNote',
        'ConsultationDiagnosis',
        'ConsultationManagement',
        'Intervention',
        'PhysicalExamination',
        'VitalSign',
        'System',
        -- Prescriptions, Dispensing, Certificates & Diagnostic Requests
        'Prescription',
        'Medicine',
        'MedicineDispenseRecord',
        'MedicinePhilHealthData',
        'Medication',
        'MedicationDrug',
        'ClinicMedicalCertificate',
        'ClinicReferralSlip',
        'DiagnosticRequest',
        'ClinicLaboratoryRequest',
        'ClinicLaboratoryRequestProcedure',
        'ClinicImagingRequest',
        'ClinicImagingRequestProcedure',
        'ClinicHeartStationRequest',
        'ClinicHeartStationRequestProcedure',
        -- Files & Sharing Visibility
        'File',
        'FileSetting',
        'FileClinicShare',
        'Folder',
        'FolderSetting',
        'FolderClinicShare',
        'OrgMemberRequirementFile'
    ];
    v_tbl TEXT;
BEGIN
    FOREACH v_tbl IN ARRAY v_tables LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = v_tbl
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_v1_sync_capture ON public.%I', v_tbl);
            EXECUTE format(
                'CREATE TRIGGER trg_v1_sync_capture '
                'AFTER INSERT OR UPDATE OR DELETE ON public.%I '
                'FOR EACH ROW EXECUTE FUNCTION _v1_sync.capture_change()',
                v_tbl
            );
        ELSE
            RAISE NOTICE 'Skipping missing public table: %', v_tbl;
        END IF;
    END LOOP;
END;
$$;

-- Automatically grant read-only access to the dedicated v1_sync_reader role if present
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v1_sync_reader') THEN
        GRANT USAGE ON SCHEMA _v1_sync TO v1_sync_reader;
        GRANT SELECT ON TABLE _v1_sync.changelog TO v1_sync_reader;
    END IF;
END;
$$;

COMMIT;
