using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Models;
using ClinicEz.V1Sync.Api.Services;
using Npgsql;
using Xunit;

namespace ClinicEz.V1Sync.Tests;

/// <summary>
/// Adversarial multi-table v1 CRUD resilience simulations running against ephemeral PostgreSQL 17
/// databases with BOTH Track 1 (CLINICEZ-CLINIC_DB) and Track 2 (CLINICEZ-PATIENT_DB) active
/// simultaneously alongside the real 65-table `_v1_sync` CDC trigger pack.
///
/// Exercises unpredictable real-world v1 user behavior:
/// - Rolled-back multi-table transactions (MVCC atomicity)
/// - Rapid DELETE -> RESTORE flip-flops, NULL <-> VALUE property churn, enum flips, and extreme typos
/// - Simultaneous hard-deletes, soft-deletes, folder privacy flips, new inserts, and sibling updates
/// - Simultaneous dual-app (v1 + v2) divergence across multiple tables with KEEP_V2 &amp; FORCE_V1 resolution
/// </summary>
[Collection("Pg17Integration")]
public sealed class AdversarialCrudResilienceSimulationTests
{
    private const string V2TenantId = "tnt-crud-sim";
    private static readonly Guid V2ClinicId = Guid.Parse("77777777-8888-9999-aaaa-bbbbbbbbbbbb");
    private const int V1ClinicId = 101;
    private const int V1OrgId = 201;

    [Fact]
    public async Task Sim1_RolledBackMultiTableV1Transaction_ProducesZeroChangelogRowsAndZeroV2Mutation()
    {
        await using var fx = await CreateDualTrackFixtureAsync();
        var (t1, t2) = await CreateDualTrackBindingsAsync(fx, "Sim1-Rollback");
        await SeedDualTrackBaselineAsync(fx.V1ConnectionString);

        var bf1 = await fx.Coordinator.ExecuteAsync(t1.Id, SyncRunMode.Backfill, null, false, "sim1-bf1", CancellationToken.None);
        var bf2 = await fx.Coordinator.ExecuteAsync(t2.Id, SyncRunMode.Backfill, null, false, "sim1-bf2", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, bf1.Status);
        Assert.Equal(SyncRunStatus.Completed, bf2.Status);

        await using var v1 = new NpgsqlConnection(fx.V1ConnectionString);
        await v1.OpenAsync();
        var seqBeforeRollback = await ScalarInt64Async(v1, "SELECT COALESCE(MAX(seq), 0) FROM _v1_sync.changelog");

        // Execute a chaotic multi-table INSERT + UPDATE + DELETE transaction and ROLLBACK!
        await using (var tx = await v1.BeginTransactionAsync())
        {
            await using var cmd = new NpgsqlCommand("""
                INSERT INTO public."User" (id, "userId", "firstName", "lastName", gender, mobile, "isActive")
                VALUES (9099, 'auth0|rolled_back', 'Ghost', 'RollbackUser', 'MALE', '09179999099', true);
                INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (599, 101, 9099);

                UPDATE public."User" SET "firstName" = 'CorruptedName', mobile = '09170000000' WHERE id = 9001;
                UPDATE public."AppointmentAttribute" SET status = 'CANCELLED' WHERE id = 1;
                UPDATE public."Medicine" SET dosage = '9999mg' WHERE id = 1;

                DELETE FROM public."UserAllergy" WHERE id = 1;
                UPDATE public."ClinicMedicalCertificate" SET "deletedAt" = now() WHERE id = 1;
                """, v1, tx);
            await cmd.ExecuteNonQueryAsync();
            await tx.RollbackAsync();
        }

        // PostgreSQL MVCC guarantees rolled-back trigger writes never persist into _v1_sync.changelog
        var seqAfterRollback = await ScalarInt64Async(v1, "SELECT COALESCE(MAX(seq), 0) FROM _v1_sync.changelog");
        Assert.Equal(seqBeforeRollback, seqAfterRollback);

        var inc1 = await fx.Coordinator.ExecuteAsync(t1.Id, SyncRunMode.Incremental, null, false, "sim1-inc1", CancellationToken.None);
        var inc2 = await fx.Coordinator.ExecuteAsync(t2.Id, SyncRunMode.Incremental, null, false, "sim1-inc2", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, inc1.Status);
        Assert.Equal(SyncRunStatus.Completed, inc2.Status);

        var sum1 = ParseSummary(inc1.Summary);
        var sum2 = ParseSummary(inc2.Summary);
        Assert.Equal(0, sum1.CohortPatientCount);
        Assert.Equal(0, sum2.CohortPatientCount);
        Assert.Equal(0, await fx.Ledger.CountOpenConflictsAsync(t1.Id));
        Assert.Equal(0, await fx.Ledger.CountOpenConflictsAsync(t2.Id));

        await using var clinicDb = new NpgsqlConnection(fx.ClinicConnectionString);
        await clinicDb.OpenAsync();
        await using var patientDb = new NpgsqlConnection(fx.PatientConnectionString);
        await patientDb.OpenAsync();

        Assert.Equal("SynthOne", await ScalarStringAsync(clinicDb, $"""SELECT "FirstName" FROM public."Patients" WHERE "Id" = '{DeterministicUuid.ClinicPatientId(V2ClinicId, 9001)}' """));
        Assert.Equal("SynthOne", await ScalarStringAsync(patientDb, $"""SELECT first_name FROM public.patients WHERE id = '{DeterministicUuid.PatientAccountId(9001)}' """));
        Assert.Equal(0L, await ScalarInt64Async(clinicDb, $"""SELECT COUNT(*) FROM public."Patients" WHERE "Id" = '{DeterministicUuid.ClinicPatientId(V2ClinicId, 9099)}' """));
        Assert.Equal(0L, await ScalarInt64Async(patientDb, $"""SELECT COUNT(*) FROM public.patients WHERE id = '{DeterministicUuid.PatientAccountId(9099)}' """));
    }

    [Fact]
    public async Task Sim2_RapidDeleteRestoreFlipFlop_NullValuePropertyChurn_And_ExtremeTypos_ConvergeCleanlyOnBothTracks()
    {
        await using var fx = await CreateDualTrackFixtureAsync();
        var (t1, t2) = await CreateDualTrackBindingsAsync(fx, "Sim2-FlipFlop-Churn");
        await SeedDualTrackBaselineAsync(fx.V1ConnectionString);

        Assert.Equal(SyncRunStatus.Completed, (await fx.Coordinator.ExecuteAsync(t1.Id, SyncRunMode.Backfill, null, false, "sim2-bf1", CancellationToken.None)).Status);
        Assert.Equal(SyncRunStatus.Completed, (await fx.Coordinator.ExecuteAsync(t2.Id, SyncRunMode.Backfill, null, false, "sim2-bf2", CancellationToken.None)).Status);

        // Unpredictable multi-table v1 editing storm within a single CDC poll window:
        // 1) Rapid soft-delete -> immediate restore flip-flop on User 9001, MedCert 1, and File 1
        // 2) NULL <-> VALUE property churn + impossible DOB typo (1845-01-01)
        // 3) Enum transitions (Physical -> Virtual, COMPLETED -> CANCELLED, Fit -> Unfit)
        // 4) Extreme vital typos (BMI 259106.8435, temp 736, spo2 989) alongside valid height/BP updates
        // 5) Dispensing state flip (false -> true) + CustomField student/employment churn
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            -- Flip-flop DELETE -> RESTORE before CDC polls
            UPDATE public."User" SET "deletedAt" = now(), "isActive" = false WHERE id = 9001;
            UPDATE public."ClinicMedicalCertificate" SET "deletedAt" = now() WHERE id = 1;
            UPDATE public."File" SET "deletedAt" = now() WHERE id = 1;

            UPDATE public."User"
            SET "deletedAt" = NULL,
                "isActive" = true,
                "middleName" = NULL,
                dob = '1845-01-01',
                "civilStatus" = 'MARRIED',
                mobile = '09171119001',
                "updatedAt" = now()
            WHERE id = 9001;
            UPDATE public."ClinicMedicalCertificate"
            SET "deletedAt" = NULL, "classificationId" = 2, remarks = 'Restored & updated remarks', "updatedAt" = now()
            WHERE id = 1;
            UPDATE public."File"
            SET "deletedAt" = NULL, name = 'restored-ecg-final.pdf', "updatedAt" = now()
            WHERE id = 1;

            -- Student & employment CustomFields churn (value update + value -> NULL)
            UPDATE public."UserStudentRecord" SET lrn = 'LRN-UPDATED-9001', "yearLevel" = 2, "updatedAt" = now() WHERE id = 1;
            UPDATE public."UserEmploymentRecord" SET designation = NULL, position = 'Senior Aide', "updatedAt" = now() WHERE id = 1;

            -- Address mutation
            UPDATE public."UserAddress" SET "addressLine" = '777 Updated Blvd', city = 'Iligan', "updatedAt" = now() WHERE id = 1;

            -- Appointment mode + status transition
            UPDATE public."AppointmentAttribute" SET "modeId" = 2, status = 'CANCELLED' WHERE id = 1;

            -- Consultation note update
            UPDATE public."ConsultationNote" SET content = 'Updated treatment plan after flip-flop' WHERE id = 4;

            -- Extreme vital sign typos mixed with valid measurements
            UPDATE public."VitalSign"
            SET height = 171.50,
                bmi = 259106.8435,
                temp = 736.00,
                spo2 = 989.00,
                "bpSystolic" = 135,
                "updatedAt" = now()
            WHERE id = 1;

            -- Dispensing flip (false -> true)
            UPDATE public."MedicineDispenseRecord"
            SET "isDispensed" = true, "dateDispensed" = '2026-03-02T11:00:00Z', "dispensingPersonnel" = 'Pharmacist Sim'
            WHERE id = 1;
            """);

        var inc1 = await fx.Coordinator.ExecuteAsync(t1.Id, SyncRunMode.Incremental, null, false, "sim2-inc1", CancellationToken.None);
        var inc2 = await fx.Coordinator.ExecuteAsync(t2.Id, SyncRunMode.Incremental, null, false, "sim2-inc2", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, inc1.Status);
        Assert.Equal(SyncRunStatus.Completed, inc2.Status);
        Assert.True(string.IsNullOrEmpty(inc1.ErrorMessage));
        Assert.True(string.IsNullOrEmpty(inc2.ErrorMessage));

        // Zero phantom shielded deletes because state-based reconciliation collapsed DELETE -> RESTORE!
        Assert.Equal(0, await fx.Ledger.CountOpenConflictsAsync(t1.Id));
        Assert.Equal(0, await fx.Ledger.CountOpenConflictsAsync(t2.Id));

        await using var clinicDb = new NpgsqlConnection(fx.ClinicConnectionString);
        await clinicDb.OpenAsync();
        await using var patientDb = new NpgsqlConnection(fx.PatientConnectionString);
        await patientDb.OpenAsync();

        var clinicPid = DeterministicUuid.ClinicPatientId(V2ClinicId, 9001);
        var patientPid = DeterministicUuid.PatientAccountId(9001);

        // Track 1 Patient checks: NULL middleName, impossible DOB nullified, CivilStatus updated, CustomFields converged
        await using (var cmd = new NpgsqlCommand($"""
            SELECT "MiddleName", "DateOfBirth", "CivilStatus", "ContactNumber", "Occupation", "CustomFields"::text
            FROM public."Patients" WHERE "Id" = '{clinicPid}'
            """, clinicDb))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            Assert.True(await r.ReadAsync());
            Assert.True(r.IsDBNull(0));
            Assert.True(r.IsDBNull(1));
            Assert.Equal("Married", r.GetString(2));
            Assert.Equal("09171119001", r.GetString(3));
            Assert.Equal("Senior Aide", r.GetString(4));
            using var doc = JsonDocument.Parse(r.GetString(5));
            Assert.Equal("LRN-UPDATED-9001", doc.RootElement.GetProperty("lrn").GetString());
            Assert.False(doc.RootElement.TryGetProperty("designation", out _));
        }

        // Track 1 Appointment, Consultation, Vitals, Prescription, MedCert, Address, Attachment checks
        Assert.Equal("Teleconsult", await ScalarStringAsync(clinicDb, $"""SELECT "AppointmentType" FROM public."Appointments" WHERE "Id" = '{DeterministicUuid.SharedAppointmentId(V2ClinicId, 801)}' """));
        Assert.Equal("Cancelled", await ScalarStringAsync(clinicDb, $"""SELECT "Status" FROM public."Appointments" WHERE "Id" = '{DeterministicUuid.SharedAppointmentId(V2ClinicId, 801)}' """));
        Assert.Contains("Updated treatment plan after flip-flop", await ScalarStringAsync(clinicDb, $"""SELECT "Plan" FROM public."Consultations" WHERE "Id" = '{DeterministicUuid.SharedConsultationId(V2ClinicId, 901)}' """));
        Assert.Equal("UnfitToWork", await ScalarStringAsync(clinicDb, $"""SELECT "FitnessStatus" FROM public."MedicalCertificates" WHERE "Id" = '{DeterministicUuid.SharedMedicalCertificateId(V2ClinicId, 1)}' """));
        Assert.Equal("777 Updated Blvd", await ScalarStringAsync(clinicDb, $"""SELECT "StreetAddress" FROM public."PatientAddresses" WHERE "PatientId" = '{clinicPid}' AND "AddressType" = 'Permanent' """));
        Assert.Equal("restored-ecg-final.pdf", await ScalarStringAsync(clinicDb, $"""SELECT "FileName" FROM public."RecordAttachments" WHERE "Id" = '{DeterministicUuid.ClinicAttachmentFromFileId(V2ClinicId, 1)}' """));

        await using (var cmd = new NpgsqlCommand($"""
            SELECT "Bmi", "TemperatureCelsius", "OxygenSaturationPercent", "HeightCm", "SystolicBp"
            FROM public."PatientVitals" WHERE "Id" = '{DeterministicUuid.SharedVitalsId(V2ClinicId, 1)}'
            """, clinicDb))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            Assert.True(await r.ReadAsync());
            Assert.True(r.IsDBNull(0));
            Assert.True(r.IsDBNull(1));
            Assert.True(r.IsDBNull(2));
            Assert.Equal(171.50m, r.GetDecimal(3));
            Assert.Equal(135, r.GetInt32(4));
        }

        Assert.Equal("true", await ScalarStringAsync(clinicDb, $"""SELECT "IsDispensed"::text FROM public."Prescriptions" WHERE "Id" = '{DeterministicUuid.SharedPrescriptionId(V2ClinicId, 1)}' """));

        // Track 2 Patient DB convergence checks
        await using (var cmd = new NpgsqlCommand($"""
            SELECT middle_name, date_of_birth, civil_status, mobile
            FROM public.patients WHERE id = '{patientPid}'
            """, patientDb))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            Assert.True(await r.ReadAsync());
            Assert.True(r.IsDBNull(0));
            Assert.True(r.IsDBNull(1));
            Assert.Equal("Married", r.GetString(2));
            Assert.Equal("09171119001", r.GetString(3));
        }

        Assert.Equal("Cancelled", await ScalarStringAsync(patientDb, $"""SELECT status FROM public.appointments WHERE id = '{DeterministicUuid.SharedAppointmentId(V2ClinicId, 801)}' """));
        Assert.Equal("true", await ScalarStringAsync(patientDb, $"""SELECT is_dispensed::text FROM public.prescriptions WHERE id = '{DeterministicUuid.SharedPrescriptionId(V2ClinicId, 1)}' """));
        Assert.Equal("restored-ecg-final.pdf", await ScalarStringAsync(patientDb, $"""SELECT file_name FROM public.file_records WHERE id = '{DeterministicUuid.PatientFileRecordId(1)}' """));

        await using (var cmd = new NpgsqlCommand($"""
            SELECT bmi, temperature_celsius, oxygen_saturation_percent, height_cm, systolic_bp
            FROM public.vital_signs WHERE id = '{DeterministicUuid.SharedVitalsId(V2ClinicId, 1)}'
            """, patientDb))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            Assert.True(await r.ReadAsync());
            Assert.True(r.IsDBNull(0));
            Assert.True(r.IsDBNull(1));
            Assert.True(r.IsDBNull(2));
            Assert.Equal(171.5m, r.GetDecimal(3));
            Assert.Equal(135, r.GetInt32(4));
        }

        // Immediate follow-up CDC is a clean no-op AND parity stays 100% matched on both tracks!
        var noop1 = await fx.Coordinator.ExecuteAsync(t1.Id, SyncRunMode.Incremental, null, false, "sim2-noop1", CancellationToken.None);
        var noop2 = await fx.Coordinator.ExecuteAsync(t2.Id, SyncRunMode.Incremental, null, false, "sim2-noop2", CancellationToken.None);
        Assert.Equal(0, ParseSummary(noop1.Summary).CohortPatientCount);
        Assert.Equal(0, ParseSummary(noop2.Summary).CohortPatientCount);

        var p1 = await fx.Coordinator.GetParityReportAsync(t1.Id, CancellationToken.None);
        var p2 = await fx.Coordinator.GetParityReportAsync(t2.Id, CancellationToken.None);
        Assert.True(p1.ReadyToFreeze, string.Join("; ", p1.Checks.Where(c => !c.IsMatched).Select(c => $"{c.EntityType}:{c.V1ExpectedCount}!={c.V2ActualCount}")));
        Assert.True(p2.ReadyToFreeze, string.Join("; ", p2.Checks.Where(c => !c.IsMatched).Select(c => $"{c.EntityType}:{c.V1ExpectedCount}!={c.V2ActualCount}")));
    }

    [Fact]
    public async Task Sim3_MixedHardDeleteSoftDeletePrivacyFlip_WithSimultaneousInsertsAndSiblingUpdates_NeverBlocksPipeline()
    {
        await using var fx = await CreateDualTrackFixtureAsync();
        var (t1, t2) = await CreateDualTrackBindingsAsync(fx, "Sim3-Mixed-CRUD-Shield");
        await SeedDualTrackBaselineAsync(fx.V1ConnectionString);

        Assert.Equal(SyncRunStatus.Completed, (await fx.Coordinator.ExecuteAsync(t1.Id, SyncRunMode.Backfill, null, false, "sim3-bf1", CancellationToken.None)).Status);
        Assert.Equal(SyncRunStatus.Completed, (await fx.Coordinator.ExecuteAsync(t2.Id, SyncRunMode.Backfill, null, false, "sim3-bf2", CancellationToken.None)).Status);

        // Single chaotic CDC window mixing:
        // - Hard DELETEs on UserAllergy 1 and UserEmergencyContact 1
        // - Soft DELETEs on Medicine 1, ClinicMedicalCertificate 1, ClinicLaboratoryRequest 1
        // - Privacy flip FolderSetting 1 (CLINIC -> PRIVATE)
        // - Simultaneous NEW INSERTs for the SAME Patient 9001 (Appointment 802, Consultation 902, VitalSign 2, UserAllergy 2)
        // - Simultaneous UPDATE on Sibling Patient 9002 (User + UserAddress)
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            DELETE FROM public."UserAllergy" WHERE id = 1;
            DELETE FROM public."UserEmergencyContact" WHERE id = 1;

            UPDATE public."Medicine" SET "deletedAt" = now() WHERE id = 1;
            UPDATE public."ClinicMedicalCertificate" SET "deletedAt" = now() WHERE id = 1;
            UPDATE public."ClinicLaboratoryRequest" SET "deletedAt" = now() WHERE id = 1;
            UPDATE public."FolderSetting" SET privacy = 'PRIVATE' WHERE id = 1;

            INSERT INTO public."UserAllergy" (id, "userId", "allergenId", reaction, notes)
            VALUES (2, 9001, 2, 'Sneezing', 'New seasonal allergy');

            INSERT INTO public."Appointment" (id, "clinicId", subject, complaint, "caseNumber")
            VALUES (802, 101, 'Follow-up Visit', 'Follow-up check', 'CASE-802');
            INSERT INTO public."AppointmentRequester" (id, "appointmentId", "userId") VALUES (2, 802, 9001);
            INSERT INTO public."AppointmentAttribute" (id, "appointmentId", date, "timeStart", "maxDuration", status, "systemId", "isWalkIn", "modeId", "typeId", "serviceId", "preferredAppointee")
            VALUES (2, 802, '2026-03-05', '10:30', 20, 'COMPLETED', 1, false, 1, 1, 1, 701);

            INSERT INTO public."ConsultationTicket" (id, "clinicId", "clinicPatientId", "appointmentId", "systemId", subject, "isActive")
            VALUES (902, 101, 501, 802, 1, 'Second Consult', true);
            INSERT INTO public."ConsultationTicketHP" (id, "consultationTicketId", "hpId") VALUES (2, 902, 701);
            INSERT INTO public."ConsultationNote" (id, "consultationTicketId", section, content)
            VALUES (5, 902, 'assessment', 'Recovering well');
            INSERT INTO public."VitalSign" (id, "userId", "consultationTicketId", "dateTaken", "bpSystolic", "bpDiastolic", "pulseRate", temp, spo2)
            VALUES (2, 9001, 902, '2026-03-05T10:35:00Z', 116, 74, 70, 36.5, 99.0);

            UPDATE public."User" SET "firstName" = 'SiblingUpdated', mobile = '09172229002', "updatedAt" = now() WHERE id = 9002;
            UPDATE public."UserAddress" SET "addressLine" = '202 Sibling New Rd', "updatedAt" = now() WHERE id = 2;
            """);

        var inc1 = await fx.Coordinator.ExecuteAsync(t1.Id, SyncRunMode.Incremental, null, false, "sim3-inc1", CancellationToken.None);
        var inc2 = await fx.Coordinator.ExecuteAsync(t2.Id, SyncRunMode.Incremental, null, false, "sim3-inc2", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, inc1.Status);
        Assert.Equal(SyncRunStatus.Completed, inc2.Status);

        await using var clinicDb = new NpgsqlConnection(fx.ClinicConnectionString);
        await clinicDb.OpenAsync();
        await using var patientDb = new NpgsqlConnection(fx.PatientConnectionString);
        await patientDb.OpenAsync();

        // 1) Non-blocking pipeline proof: new inserts for Patient 9001 + sibling updates for 9002 landed cleanly on BOTH tracks!
        Assert.Equal(1L, await ScalarInt64Async(clinicDb, $"""SELECT COUNT(*) FROM public."Appointments" WHERE "Id" = '{DeterministicUuid.SharedAppointmentId(V2ClinicId, 802)}' AND "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(clinicDb, $"""SELECT COUNT(*) FROM public."Consultations" WHERE "Id" = '{DeterministicUuid.SharedConsultationId(V2ClinicId, 902)}' AND "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(clinicDb, $"""SELECT COUNT(*) FROM public."PatientVitals" WHERE "Id" = '{DeterministicUuid.SharedVitalsId(V2ClinicId, 2)}' AND "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(clinicDb, $"""SELECT COUNT(*) FROM public."PatientAllergies" WHERE "Id" = '{ClinicAllergyId(2)}' AND "IsDeleted" = false"""));
        Assert.Equal("SiblingUpdated", await ScalarStringAsync(clinicDb, $"""SELECT "FirstName" FROM public."Patients" WHERE "Id" = '{DeterministicUuid.ClinicPatientId(V2ClinicId, 9002)}' """));
        Assert.Equal("202 Sibling New Rd", await ScalarStringAsync(clinicDb, $"""SELECT "StreetAddress" FROM public."PatientAddresses" WHERE "PatientId" = '{DeterministicUuid.ClinicPatientId(V2ClinicId, 9002)}' """));

        Assert.Equal(1L, await ScalarInt64Async(patientDb, $"""SELECT COUNT(*) FROM public.appointments WHERE id = '{DeterministicUuid.SharedAppointmentId(V2ClinicId, 802)}' AND is_deleted = false"""));
        Assert.Equal(1L, await ScalarInt64Async(patientDb, $"""SELECT COUNT(*) FROM public.consultations WHERE id = '{DeterministicUuid.SharedConsultationId(V2ClinicId, 902)}' AND is_deleted = false"""));
        Assert.Equal(1L, await ScalarInt64Async(patientDb, $"""SELECT COUNT(*) FROM public.vital_signs WHERE id = '{DeterministicUuid.SharedVitalsId(V2ClinicId, 2)}' AND is_deleted = false"""));
        Assert.Equal(1L, await ScalarInt64Async(patientDb, $"""SELECT COUNT(*) FROM public.patient_allergies WHERE id = '{DeterministicUuid.Create(DeterministicUuid.PatientNamespace, "v1_allergy:2")}' AND is_deleted = false"""));
        Assert.Equal("SiblingUpdated", await ScalarStringAsync(patientDb, $"""SELECT first_name FROM public.patients WHERE id = '{DeterministicUuid.PatientAccountId(9002)}' """));
        Assert.Equal("202 Sibling New Rd", await ScalarStringAsync(patientDb, $"""SELECT house_street FROM public.patient_addresses WHERE patient_id = '{DeterministicUuid.PatientAccountId(9002)}' """));

        // 2) Deletion Shield proof: EVERY hard-deleted, soft-deleted, and privatized v2 record stays live & intact!
        Assert.Equal(1L, await ScalarInt64Async(clinicDb, $"""SELECT COUNT(*) FROM public."PatientAllergies" WHERE "Id" = '{ClinicAllergyId(1)}' AND "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(clinicDb, $"""SELECT COUNT(*) FROM public."PatientGuardians" WHERE "Id" = '{ClinicGuardianId(1)}' AND "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(clinicDb, $"""SELECT COUNT(*) FROM public."Prescriptions" WHERE "Id" = '{DeterministicUuid.SharedPrescriptionId(V2ClinicId, 1)}' AND "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(clinicDb, $"""SELECT COUNT(*) FROM public."MedicalCertificates" WHERE "Id" = '{DeterministicUuid.SharedMedicalCertificateId(V2ClinicId, 1)}' AND "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(clinicDb, $"""SELECT COUNT(*) FROM public."LabOrders" WHERE "Id" = '{DeterministicUuid.SharedLabOrderId(V2ClinicId, "lab", 1)}' AND "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(clinicDb, $"""SELECT COUNT(*) FROM public."RecordAttachments" WHERE "Id" = '{DeterministicUuid.ClinicAttachmentFromFileId(V2ClinicId, 1)}' AND "IsDeleted" = false"""));

        Assert.Equal(1L, await ScalarInt64Async(patientDb, $"""SELECT COUNT(*) FROM public.patient_allergies WHERE id = '{DeterministicUuid.Create(DeterministicUuid.PatientNamespace, "v1_allergy:1")}' AND is_deleted = false"""));
        Assert.Equal(1L, await ScalarInt64Async(patientDb, $"""SELECT COUNT(*) FROM public.emergency_contacts WHERE id = '{DeterministicUuid.Create(DeterministicUuid.PatientNamespace, "v1_ec:1")}' AND is_deleted = false"""));
        Assert.Equal(1L, await ScalarInt64Async(patientDb, $"""SELECT COUNT(*) FROM public.prescriptions WHERE id = '{DeterministicUuid.SharedPrescriptionId(V2ClinicId, 1)}' AND is_deleted = false"""));
        Assert.Equal(1L, await ScalarInt64Async(patientDb, $"""SELECT COUNT(*) FROM public.medical_certificates WHERE id = '{DeterministicUuid.SharedMedicalCertificateId(V2ClinicId, 1)}' AND is_deleted = false"""));
        Assert.Equal(1L, await ScalarInt64Async(patientDb, $"""SELECT COUNT(*) FROM public.lab_request_slips WHERE id = '{DeterministicUuid.SharedLabOrderId(V2ClinicId, "lab", 1)}' AND is_deleted = false"""));
        Assert.Equal(1L, await ScalarInt64Async(patientDb, $"""SELECT COUNT(*) FROM public.file_records WHERE id = '{DeterministicUuid.PatientFileRecordId(1)}' AND is_deleted = false"""));

        // 3) Cross-track conflict & privacy semantics:
        //    Track 1 shields all 6 disappeared entities including FolderSetting=PRIVATE (file:1).
        //    Track 2 shields the 5 genuinely deleted entities, and DOES NOT shield FileRecord 1 (private files belong to the patient!).
        var (t1Conflicts, _) = await fx.Ledger.ListConflictsAsync(t1.Id, SyncConflictStatus.Open, 50, 0);
        var (t2Conflicts, _) = await fx.Ledger.ListConflictsAsync(t2.Id, SyncConflictStatus.Open, 50, 0);

        Assert.Contains(t1Conflicts, c => c.EntityType == "PatientAllergy" && c.V1Id == "1" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(t1Conflicts, c => c.EntityType == "PatientGuardian" && c.V1Id == "1" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(t1Conflicts, c => c.EntityType == "Prescription" && c.V1Id == "1" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(t1Conflicts, c => c.EntityType == "MedicalCertificate" && c.V1Id == "1" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(t1Conflicts, c => c.EntityType == "LabOrder" && c.V1Id == "lab:1" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(t1Conflicts, c => c.EntityType == "RecordAttachment" && c.V1Id == "file:1" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);

        Assert.Contains(t2Conflicts, c => c.EntityType == "PatientAllergy" && c.V1Id == "1" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(t2Conflicts, c => c.EntityType == "EmergencyContact" && c.V1Id == "1" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(t2Conflicts, c => c.EntityType == "PatientPrescription" && c.V1Id == "1" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(t2Conflicts, c => c.EntityType == "PatientMedicalCertificate" && c.V1Id == "1" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(t2Conflicts, c => c.EntityType == "PatientLabRequestSlip" && c.V1Id == "lab:1" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.DoesNotContain(t2Conflicts, c => c.EntityType == "FileRecord" && c.V1Id == "1");

        // Zero-PHI check on conflict metadata + Deletion Shield blocks FORCE_V1 while allowing KEEP_V2!
        foreach (var c in t1Conflicts.Concat(t2Conflicts))
        {
            var raw = string.Join(",", c.ChangedFields);
            Assert.DoesNotContain("SynthOne", raw, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Penicillin", raw, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("09170009001", raw, StringComparison.OrdinalIgnoreCase);
        }

        var shieldedCert = t1Conflicts.First(c => c.EntityType == "MedicalCertificate" && c.V1Id == "1");
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            fx.Coordinator.ResolveConflictAsync(shieldedCert.Id, "FORCE_V1", "sim-reviewer", CancellationToken.None));

        var keptCert = await fx.Coordinator.ResolveConflictAsync(shieldedCert.Id, "KEEP_V2", "sim-reviewer", CancellationToken.None);
        Assert.NotNull(keptCert);
        Assert.Equal(SyncConflictStatus.ResolvedKeepV2, keptCert.Conflict.Status);
    }

    [Fact]
    public async Task Sim4_SimultaneousDualAppDivergence_V2WinsProtectsAllTables_KeepV2Rebaselines_ForceV1ReconcilesTargetedRow()
    {
        await using var fx = await CreateDualTrackFixtureAsync();
        var (t1, t2) = await CreateDualTrackBindingsAsync(fx, "Sim4-DualApp-Divergence");
        await SeedDualTrackBaselineAsync(fx.V1ConnectionString);

        Assert.Equal(SyncRunStatus.Completed, (await fx.Coordinator.ExecuteAsync(t1.Id, SyncRunMode.Backfill, null, false, "sim4-bf1", CancellationToken.None)).Status);
        Assert.Equal(SyncRunStatus.Completed, (await fx.Coordinator.ExecuteAsync(t2.Id, SyncRunMode.Backfill, null, false, "sim4-bf2", CancellationToken.None)).Status);

        var clinicPid = DeterministicUuid.ClinicPatientId(V2ClinicId, 9001);
        var clinicAllergyId = ClinicAllergyId(1);
        var apptId = DeterministicUuid.SharedAppointmentId(V2ClinicId, 801);
        var consultId = DeterministicUuid.SharedConsultationId(V2ClinicId, 901);
        var patientPid = DeterministicUuid.PatientAccountId(9001);
        var patientAllergyId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, "v1_allergy:1");

        // 1) Clinic staff & Patient simultaneously edit records directly in v2 Clinic DB & v2 Patient DB
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $"""
            UPDATE public."Patients" SET "ContactNumber" = '0917-V2-CLINIC' WHERE "Id" = '{clinicPid}';
            UPDATE public."PatientAllergies" SET "ReactionManifestation" = 'V2 Clinic Reaction' WHERE "Id" = '{clinicAllergyId}';
            UPDATE public."Appointments" SET "Reason" = 'V2 Clinic Appt Reason' WHERE "Id" = '{apptId}';
            UPDATE public."Consultations" SET "Plan" = 'V2 Clinic Consultation Plan' WHERE "Id" = '{consultId}';
            """);

        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, $"""
            UPDATE public.patients SET mobile = '0917-V2-PATIENT' WHERE id = '{patientPid}';
            UPDATE public.patient_allergies SET reaction = 'V2 Patient Reaction' WHERE id = '{patientAllergyId}';
            """);

        // 2) Simultaneously, v1 mutates ALL of those exact same records!
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."User" SET mobile = '0917-V1-OVERWRITE', "updatedAt" = now() WHERE id = 9001;
            UPDATE public."UserAllergy" SET reaction = 'V1 Allergy Overwrite' WHERE id = 1;
            UPDATE public."Appointment" SET complaint = 'V1 Appt Overwrite', "updatedAt" = now() WHERE id = 801;
            UPDATE public."ConsultationNote" SET content = 'V1 Consult Plan Overwrite' WHERE id = 4;
            """);

        // 3) Run Incremental CDC twice -> v2-wins MUST protect every single edited v2 row & deduplicate conflicts!
        Assert.Equal(SyncRunStatus.Completed, (await fx.Coordinator.ExecuteAsync(t1.Id, SyncRunMode.Incremental, null, false, "sim4-inc1a", CancellationToken.None)).Status);
        Assert.Equal(SyncRunStatus.Completed, (await fx.Coordinator.ExecuteAsync(t2.Id, SyncRunMode.Incremental, null, false, "sim4-inc2a", CancellationToken.None)).Status);

        // Trigger another v1 touch to verify conflict deduplication (no duplicate OPEN conflict rows)
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."User" SET mobile = '0917-V1-OVERWRITE-2', "updatedAt" = now() WHERE id = 9001;
            """);
        Assert.Equal(SyncRunStatus.Completed, (await fx.Coordinator.ExecuteAsync(t1.Id, SyncRunMode.Incremental, null, false, "sim4-inc1b", CancellationToken.None)).Status);
        Assert.Equal(SyncRunStatus.Completed, (await fx.Coordinator.ExecuteAsync(t2.Id, SyncRunMode.Incremental, null, false, "sim4-inc2b", CancellationToken.None)).Status);

        await using var clinicDb = new NpgsqlConnection(fx.ClinicConnectionString);
        await clinicDb.OpenAsync();
        await using var patientDb = new NpgsqlConnection(fx.PatientConnectionString);
        await patientDb.OpenAsync();

        // Confirm zero silent overwrites across all 6 diverged rows
        Assert.Equal("0917-V2-CLINIC", await ScalarStringAsync(clinicDb, $"""SELECT "ContactNumber" FROM public."Patients" WHERE "Id" = '{clinicPid}' """));
        Assert.Equal("V2 Clinic Reaction", await ScalarStringAsync(clinicDb, $"""SELECT "ReactionManifestation" FROM public."PatientAllergies" WHERE "Id" = '{clinicAllergyId}' """));
        Assert.Equal("V2 Clinic Appt Reason", await ScalarStringAsync(clinicDb, $"""SELECT "Reason" FROM public."Appointments" WHERE "Id" = '{apptId}' """));
        Assert.Equal("V2 Clinic Consultation Plan", await ScalarStringAsync(clinicDb, $"""SELECT "Plan" FROM public."Consultations" WHERE "Id" = '{consultId}' """));
        Assert.Equal("0917-V2-PATIENT", await ScalarStringAsync(patientDb, $"""SELECT mobile FROM public.patients WHERE id = '{patientPid}' """));
        Assert.Equal("V2 Patient Reaction", await ScalarStringAsync(patientDb, $"""SELECT reaction FROM public.patient_allergies WHERE id = '{patientAllergyId}' """));

        var (t1Conflicts, _) = await fx.Ledger.ListConflictsAsync(t1.Id, SyncConflictStatus.Open, 50, 0);
        var (t2Conflicts, _) = await fx.Ledger.ListConflictsAsync(t2.Id, SyncConflictStatus.Open, 50, 0);

        var t1PatConflict = Assert.Single(t1Conflicts, c => c.EntityType == "Patient" && c.V1Id == "9001");
        var t1AllergyConflict = Assert.Single(t1Conflicts, c => c.EntityType == "PatientAllergy" && c.V1Id == "1");
        Assert.Single(t1Conflicts, c => c.EntityType == "Appointment" && c.V1Id == "801");
        Assert.Single(t1Conflicts, c => c.EntityType == "Consultation" && c.V1Id == "901");

        var t2PatConflict = Assert.Single(t2Conflicts, c => c.EntityType == "PatientAccount" && c.V1Id == "9001");
        var t2AllergyConflict = Assert.Single(t2Conflicts, c => c.EntityType == "PatientAllergy" && c.V1Id == "1");

        // 4) KEEP_V2 on Patient (Track 1) and PatientAccount (Track 2) re-baselines hashes without touching v2 data
        var keep1 = await fx.Coordinator.ResolveConflictAsync(t1PatConflict.Id, "KEEP_V2", "sim4-reviewer", CancellationToken.None);
        var keep2 = await fx.Coordinator.ResolveConflictAsync(t2PatConflict.Id, "KEEP_V2", "sim4-reviewer", CancellationToken.None);
        Assert.NotNull(keep1);
        Assert.NotNull(keep2);
        Assert.Equal(SyncConflictStatus.ResolvedKeepV2, keep1.Conflict.Status);
        Assert.Equal(SyncConflictStatus.ResolvedKeepV2, keep2.Conflict.Status);

        // 5) FORCE_V1 on PatientAllergy (Track 1 & Track 2) reconciles ONLY the targeted allergy row to v1's payload
        var force1 = await fx.Coordinator.ResolveConflictAsync(t1AllergyConflict.Id, "FORCE_V1", "sim4-reviewer", CancellationToken.None);
        var force2 = await fx.Coordinator.ResolveConflictAsync(t2AllergyConflict.Id, "FORCE_V1", "sim4-reviewer", CancellationToken.None);
        Assert.NotNull(force1);
        Assert.NotNull(force2);
        Assert.Equal(SyncConflictStatus.ResolvedForceV1, force1.Conflict.Status);
        Assert.Equal(SyncConflictStatus.ResolvedForceV1, force2.Conflict.Status);

        // Verify surgical precision: allergies updated to v1, while KEEP_V2 & unresolved v2-wins rows stayed untouched!
        Assert.Equal("V1 Allergy Overwrite", await ScalarStringAsync(clinicDb, $"""SELECT "ReactionManifestation" FROM public."PatientAllergies" WHERE "Id" = '{clinicAllergyId}' """));
        Assert.Equal("V1 Allergy Overwrite", await ScalarStringAsync(patientDb, $"""SELECT reaction FROM public.patient_allergies WHERE id = '{patientAllergyId}' """));

        Assert.Equal("0917-V2-CLINIC", await ScalarStringAsync(clinicDb, $"""SELECT "ContactNumber" FROM public."Patients" WHERE "Id" = '{clinicPid}' """));
        Assert.Equal("0917-V2-PATIENT", await ScalarStringAsync(patientDb, $"""SELECT mobile FROM public.patients WHERE id = '{patientPid}' """));
        Assert.Equal("V2 Clinic Appt Reason", await ScalarStringAsync(clinicDb, $"""SELECT "Reason" FROM public."Appointments" WHERE "Id" = '{apptId}' """));
        Assert.Equal("V2 Clinic Consultation Plan", await ScalarStringAsync(clinicDb, $"""SELECT "Plan" FROM public."Consultations" WHERE "Id" = '{consultId}' """));
    }

    // -------------------------------------------------------------------------
    // Shared Dual-Track Fixture & Baseline Seeding Helpers (Zero PHI)
    // -------------------------------------------------------------------------

    private static async Task<Pg17TestFixture> CreateDualTrackFixtureAsync()
    {
        var fx = new Pg17TestFixture();
        await fx.InitializeAsync();
        await Track1ClinicSyncIntegrationTests.InstallExtendedTrack1SchemasAsync(fx);

        // Add the Track 2-specific v1 columns/tables that Track 1's schema did not require, then re-install CDC triggers
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            CREATE TABLE IF NOT EXISTS public."Clinic" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            ALTER TABLE public."Vaccine" ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'OTHER';
            ALTER TABLE public."UserVaccination" ADD COLUMN IF NOT EXISTS "hpId" INT;
            ALTER TABLE public."UserAddress" ADD COLUMN IF NOT EXISTS country TEXT;
            ALTER TABLE public."ClinicPatient"
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."Folder" ADD COLUMN IF NOT EXISTS name TEXT;
            ALTER TABLE public."Prescription"
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."MedicalHistory"
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."ConsultationDiagnosis"
                ADD COLUMN IF NOT EXISTS "icd10Code" TEXT,
                ADD COLUMN IF NOT EXISTS description TEXT,
                ADD COLUMN IF NOT EXISTS type TEXT;
            """);

        var cdcSql = await File.ReadAllTextAsync(Path.Combine(Pg17TestFixture.SqlDirectory, "01_install_v1_sync_changelog.sql"));
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, cdcSql);

        await Track2AndCdcIntegrationTests.ExtendPatientDbSchemaForTrack2Async(fx.PatientConnectionString);
        return fx;
    }

    private static async Task<(SyncBinding Track1, SyncBinding Track2)> CreateDualTrackBindingsAsync(Pg17TestFixture fx, string prefix)
    {
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $"""
            INSERT INTO public."Settings" ("Id","TenantId","TenantSlug","FacilitySlug","ClinicId","ClinicName")
            VALUES ('{Guid.NewGuid()}','{V2TenantId}','sim-org','sim-clinic','{V2ClinicId}','Simulation Clinic');
            """);

        var t1 = await fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track1Clinic, $"{prefix}-T1", V1ClinicId, V1OrgId, V2TenantId, V2ClinicId),
            "sim-harness");
        var t2 = await fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track2Patient, $"{prefix}-T2", V1ClinicId, V1OrgId, V2TenantId, V2ClinicId, SyncCohortMode.Scoped),
            "sim-harness");

        return (t1, t2);
    }

    private static async Task SeedDualTrackBaselineAsync(string v1ConnString)
    {
        await Pg17TestFixture.ExecuteSqlAsync(v1ConnString, """
            INSERT INTO public."Clinic" (id, name) VALUES (101, 'Simulation Clinic 101') ON CONFLICT (id) DO NOTHING;
            INSERT INTO public."System" (id, name) VALUES (1, 'General Medicine');
            INSERT INTO public."FileType" (id, name) VALUES (1, 'Electrocardiogram (ECG)'), (2, 'Laboratory Result');
            INSERT INTO public."AppointmentMode" (id, name) VALUES (1, 'Physical'), (2, 'Virtual');
            INSERT INTO public."AppointmentType" (id, name) VALUES (1, 'General Consult');
            INSERT INTO public."Service" (id, name, "isActive", "deletedAt") VALUES (1, 'Primary Care', true, NULL);
            INSERT INTO public."Allergen" (id, name) VALUES (1, 'Penicillin'), (2, 'Dust');
            INSERT INTO public."HealthCondition" (id, name, code) VALUES (1, 'Essential Hypertension', 'I10');
            INSERT INTO public."Vaccine" (id, name, type) VALUES (1, 'Hepatitis B', 'OTHER');
            INSERT INTO public."Dose" (id, dose) VALUES (1, 'Dose 1');
            INSERT INTO public."Route" (id, route) VALUES (1, 'Intramuscular');
            INSERT INTO public."MedicalCertificateReason" (id, name) VALUES (1, 'Fit to Work');
            INSERT INTO public."MedicalCertificateFinding" (id, name) VALUES (1, 'Normal findings');
            INSERT INTO public."MedicalCertificateClassification" (id, name) VALUES (1, 'Fit to Work'), (2, 'Unfit to Work');
            INSERT INTO public."ClinicLaboratoryProcedure" (id, name, category, "rvsCode") VALUES (1, 'Complete Blood Count', 'Hematology', 'CBC-01');
            INSERT INTO public."Drug" (id, "genericName", "brandName") VALUES (1, 'Paracetamol', 'Biogesic');

            INSERT INTO public."OrganizationCollege" (id, "organizationId", name) VALUES (1, 201, 'College of Computing');
            INSERT INTO public."OrganizationProgram" (id, "organizationId", name) VALUES (1, 201, 'BSCS');
            INSERT INTO public."OrganizationDepartment" (id, "organizationId", name) VALUES (1, 201, 'Clinic Ops');
            INSERT INTO public."OrganizationOffice" (id, "organizationId", name) VALUES (1, 201, 'Health Unit');
            INSERT INTO public."OrganizationYearLevel" (id, "organizationId", name) VALUES (1, 201, '1st Year'), (2, 201, '2nd Year');
            INSERT INTO public."StudentLevel" (id, name) VALUES (1, 'College');

            INSERT INTO public."User" (id, "userId", "firstName", "lastName", "middleName", dob, gender, "civilStatus", "bloodType", mobile, email, "accountType", "onboardingStatus", "verificationStatus", "isActive")
            VALUES
                (9001, 'auth0|sim_9001', 'SynthOne', 'PatientOne', 'InitialMid', '1997-05-15', 'MALE', 'SINGLE', 'O_POSITIVE', '09170009001', 'sim9001@example.test', 'STUDENT', 'COMPLETED', 'VERIFIED', true),
                (9002, 'user_clerk_sim_9002', 'SynthTwo', 'SiblingTwo', 'B', '1999-08-20', 'FEMALE', 'SINGLE', 'A_POSITIVE', '09170009002', 'sim9002@example.test', 'STUDENT', 'COMPLETED', 'VERIFIED', true),
                (9003, 'auth0|sim_doc_9003', 'Doctor', 'SimClinician', NULL, '1986-01-10', 'FEMALE', 'MARRIED', 'B_POSITIVE', '09170009003', 'simdoc@example.test', 'EMPLOYEE', 'COMPLETED', 'VERIFIED', true);

            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (501, 101, 9001), (502, 101, 9002);
            INSERT INTO public."OrganizationMember" (id, "organizationId", "userId") VALUES (601, 201, 9001), (602, 201, 9002);
            INSERT INTO public."UserStudentRecord" (id, "userId", "organizationId", "studentId", lrn, level, "collegeId", "programId", "yearLevel")
            VALUES (1, 9001, 201, '2026-9001', 'LRN-INIT-9001', 1, 1, 1, 1);
            INSERT INTO public."UserEmploymentRecord" (id, "userId", "organizationId", "employeeId", "departmentId", "officeId", "collegeId", position, designation)
            VALUES (1, 9001, 201, 'EMP-9001', 1, 1, 1, 'Junior Aide', 'Lab Helper');

            INSERT INTO public."HealthcareProvider" (id, "userId") VALUES (701, 9003);
            INSERT INTO public."HPProfile" (id, "healthcareProviderId", title, name, suffix) VALUES (1, 701, 'Dr.', 'SimClinician', 'MD');
            INSERT INTO public."ProfessionalDetails" (id, "healthcareProverId", "licenseNumber", "ptrNumber") VALUES (1, 701, 'PRC-701', 'PTR-701');

            INSERT INTO public."UserAddress" (id, "userId", "addressLine", barangay, city, state, region, "zipCode", country, "isPrimary")
            VALUES
                (1, 9001, '101 Baseline St', 'Brgy 1', 'Cagayan de Oro', 'Misamis Oriental', 'Region X', '9000', 'Philippines', true),
                (2, 9002, '201 Sibling St', 'Brgy 2', 'Cagayan de Oro', 'Misamis Oriental', 'Region X', '9000', 'Philippines', true);
            INSERT INTO public."UserEmergencyContact" (id, "userId", "firstName", "lastName", phone, relationship, "isPrimary")
            VALUES (1, 9001, 'Guard', 'Baseline', '09170009991', 'Parent', true);
            INSERT INTO public."UserAllergy" (id, "userId", "allergenId", reaction, notes)
            VALUES (1, 9001, 1, 'Initial Hives', 'Baseline allergy');

            INSERT INTO public."Appointment" (id, "clinicId", subject, complaint, "caseNumber")
            VALUES (801, 101, 'Initial Checkup', 'Mild cough', 'CASE-801');
            INSERT INTO public."AppointmentRequester" (id, "appointmentId", "userId") VALUES (1, 801, 9001);
            INSERT INTO public."AppointmentAttribute" (id, "appointmentId", date, "timeStart", "maxDuration", status, "systemId", "isWalkIn", "modeId", "typeId", "serviceId", "preferredAppointee")
            VALUES (1, 801, '2026-03-01', '09:00', 30, 'COMPLETED', 1, false, 1, 1, 1, 701);

            INSERT INTO public."ConsultationTicket" (id, "clinicId", "clinicPatientId", "appointmentId", "systemId", subject, "isActive")
            VALUES (901, 101, 501, 801, 1, 'Baseline Consult', true);
            INSERT INTO public."ConsultationTicketAttribute" (id, "consultationTicketId", status) VALUES (1, 901, 'COMPLETED');
            INSERT INTO public."ConsultationTicketHP" (id, "consultationTicketId", "hpId") VALUES (1, 901, 701);
            INSERT INTO public."ConsultationNote" (id, "consultationTicketId", section, content) VALUES
                (1, 901, 'subjective', 'Initial cough'),
                (2, 901, 'objective', 'Clear lungs'),
                (3, 901, 'assessment', 'Mild URI'),
                (4, 901, 'plan', 'Initial supportive plan');
            INSERT INTO public."ConsultationDiagnosis" (id, "consultationTicketId", "icd10Code", description, type)
            VALUES (1, 901, 'I10', 'Essential Hypertension', 'PRIMARY');

            INSERT INTO public."VitalSign" (id, "userId", "consultationTicketId", "dateTaken", height, weight, bmi, "bpSystolic", "bpDiastolic", "pulseRate", temp, spo2, "respRate")
            VALUES (1, 9001, 901, '2026-03-01T09:10:00Z', 170.0, 68.5, 23.70, 120, 80, 72, 36.6, 98.0, 16);

            INSERT INTO public."Prescription" (id, "clinicId", "patientId", "consultationTicketId", "hpId", "serialNumber", remarks)
            VALUES (1, 101, 501, 901, 701, 'RX-SIM-1', 'After meals');
            INSERT INTO public."Medicine" (id, "prescriptionId", name, "genericName", "brandName", dosage, frequency, unit, duration, qty)
            VALUES (1, 1, 'Paracetamol 500mg', 'Paracetamol', 'Biogesic', '500mg', 'Every 6h', 'tablet', 5, 10);
            INSERT INTO public."MedicineDispenseRecord" (id, "medicineId", "isDispensed") VALUES (1, 1, false);

            INSERT INTO public."ClinicLaboratoryRequest" (id, "clinicId", "clinicPatientId", "consultationTicketId", "hpId", "serialNumber", impression)
            VALUES (1, 101, 501, 901, 701, 'LAB-SIM-1', 'Baseline CBC');
            INSERT INTO public."ClinicLaboratoryRequestProcedure" (id, "clinicLaboratoryRequestId", "clinicLaboratoryProcedureId") VALUES (1, 1, 1);

            INSERT INTO public."ClinicMedicalCertificate" (id, "clinicId", "clinicPatientId", "consultationTicketId", "hpId", "serialNumber", "reasonId", "findingId", "classificationId", impression, remarks)
            VALUES (1, 101, 501, 901, 701, 'MC-SIM-1', 1, 1, 1, 'Cleared', 'Initial cert');

            INSERT INTO public."Folder" (id, "userId", name, "isActive", "deletedAt") VALUES (1, 9001, 'Clinic Folder', true, NULL);
            INSERT INTO public."FolderSetting" (id, "folderId", privacy, "scopeClinicId") VALUES (1, 1, 'CLINIC', 101);
            INSERT INTO public."File" (id, "folderId", "fileTypeId", name, size, url, "mimeType", "dateTaken")
            VALUES (1, 1, 1, 'baseline-ecg.pdf', 2048, 'https://storage.example.test/files/baseline-ecg.pdf', 'application/pdf', '2026-03-01T09:00:00Z');
            INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId") VALUES (1, 1, 'CLINIC', 101);
            """);
    }

    private static Guid ClinicAllergyId(int v1Id) =>
        DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{V2ClinicId:D}:v1_allergy:{v1Id}");

    private static Guid ClinicGuardianId(int v1Id) =>
        DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{V2ClinicId:D}:v1_ec:{v1Id}");

    private static SyncRunSummary ParseSummary(JsonElement summary) =>
        JsonSerializer.Deserialize<SyncRunSummary>(summary.GetRawText(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

    private static async Task<long> ScalarInt64Async(NpgsqlConnection conn, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        var val = await cmd.ExecuteScalarAsync();
        return Convert.ToInt64(val);
    }

    private static async Task<string?> ScalarStringAsync(NpgsqlConnection conn, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        var val = await cmd.ExecuteScalarAsync();
        return val is DBNull or null ? null : val.ToString();
    }
}
