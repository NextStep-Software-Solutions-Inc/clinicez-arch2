using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Models;
using ClinicEz.V1Sync.Api.Services;
using FluentAssertions;
using Npgsql;
using Xunit;

namespace ClinicEz.V1Sync.Tests;

[Collection("Pg17Integration")]
public sealed class Track2AndCdcIntegrationTests
{
    private const string V2TenantId = "tnt-track2-test";
    private static readonly Guid V2ClinicId = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    private const int V1ClinicId = 101;
    private const int V1OrgId = 201;

    [Fact]
    public async Task T1_FullGroupAAndGroupB_SyncsAll24EntitiesAccuratelyAndIsIdempotent()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 Full Scoped T1");

        await SeedComprehensiveV1ClinicAndPatientDataAsync(fx.V1ConnectionString);

        var run1 = await fx.Coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.Backfill, sampleLimit: null, forceV1OnConflict: false, triggeredBy: "test-t1", ct: CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);
        Assert.True(string.IsNullOrEmpty(run1.ErrorMessage));

        await using var v2 = new NpgsqlConnection(fx.PatientConnectionString);
        await v2.OpenAsync();

        var auth0PatientId = DeterministicUuid.PatientAccountId(2001);
        var clerkPatientId = DeterministicUuid.PatientAccountId(2002);

        // Auth0 -> clerk_user_id IS NULL (zero Clerk pre-creation, zero Auth0 in v2); Clerk -> preserved
        Assert.Null(await ScalarStringAsync(v2, $"""SELECT clerk_user_id FROM public.patients WHERE id = '{auth0PatientId}' """));
        Assert.Equal("user_clerk_2002", await ScalarStringAsync(v2, $"""SELECT clerk_user_id FROM public.patients WHERE id = '{clerkPatientId}' """));

        // Enum, MaxLength & mapping assertions
        Assert.Equal("Other", await ScalarStringAsync(v2, $"""SELECT relation FROM public.patient_family_histories WHERE patient_id = '{auth0PatientId}' """));
        Assert.Equal("CurrentSmoker", await ScalarStringAsync(v2, $"""SELECT smoking_status FROM public.patient_social_histories WHERE patient_id = '{auth0PatientId}' """));
        Assert.Equal("Occasional", await ScalarStringAsync(v2, $"""SELECT alcohol_use FROM public.patient_social_histories WHERE patient_id = '{auth0PatientId}' """));
        Assert.Equal("Synced", await ScalarStringAsync(v2, $"""SELECT sync_status FROM public.file_records WHERE patient_id = '{auth0PatientId}' LIMIT 1"""));
        Assert.Equal(SyncTransforms.DocTypeLabResult.ToString("D"),
            await ScalarStringAsync(v2, $"""SELECT document_type_id::text FROM public.file_records WHERE id = '{DeterministicUuid.PatientFileRecordId(1)}' """));

        // Active file inside deleted Folder (file 2) MUST be excluded; PRIVATE file in active folder (file 1) MUST be included!
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.file_records WHERE patient_id = '{auth0PatientId}' """));

        // patient_disabilities enriched classification without non-existent columns
        var disCls = await ScalarStringAsync(v2, $"""SELECT classification FROM public.patient_disabilities WHERE patient_id = '{auth0PatientId}' """);
        Assert.Contains("Visual", disCls);
        Assert.Contains("MODERATE", disCls);

        // Split UserVaccination: hpId IS NULL -> patient_immunizations_self; hpId IS NOT NULL -> vaccinations_administered
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.patient_immunizations_self WHERE patient_id = '{auth0PatientId}' """));
        Assert.Equal("Pregnant", await ScalarStringAsync(v2, $"""SELECT immunization_category FROM public.patient_immunizations_self WHERE patient_id = '{auth0PatientId}' """));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.vaccinations_administered WHERE patient_id = '{auth0PatientId}' """));
        Assert.Equal("Dr. ClinicianOne MD", await ScalarStringAsync(v2, $"""SELECT administered_by FROM public.vaccinations_administered WHERE patient_id = '{auth0PatientId}' """));

        // patient_medications (Medication + MedicationDrug + Drug)
        Assert.Equal("Glucophage", await ScalarStringAsync(v2, $"""SELECT medication_name FROM public.patient_medications WHERE patient_id = '{auth0PatientId}' """));
        Assert.Equal("Metformin", await ScalarStringAsync(v2, $"""SELECT generic_name FROM public.patient_medications WHERE patient_id = '{auth0PatientId}' """));

        // patient_government_ids philhealth_category mapped ('DD')
        Assert.Equal("DD", await ScalarStringAsync(v2, $"""SELECT philhealth_category FROM public.patient_government_ids WHERE patient_id = '{auth0PatientId}' AND id_type = 'PhilHealth' """));

        // Group B: provider_id resolved, consultation_id + assessment 2000 + diagnosis/icd10code
        var expectedHpUuid = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, "v1_hp:701").ToString("D");
        Assert.Equal(expectedHpUuid, await ScalarStringAsync(v2, $"""SELECT provider_id::text FROM public.appointments WHERE patient_id = '{auth0PatientId}' """));
        Assert.Equal("Primary Care", await ScalarStringAsync(v2, $"""SELECT service_type FROM public.appointments WHERE patient_id = '{auth0PatientId}' """));
        Assert.Equal(expectedHpUuid, await ScalarStringAsync(v2, $"""SELECT provider_id::text FROM public.consultations WHERE patient_id = '{auth0PatientId}' """));
        Assert.Equal("I10", await ScalarStringAsync(v2, $"""SELECT icd10code FROM public.consultations WHERE patient_id = '{auth0PatientId}' """));
        Assert.True((await ScalarStringAsync(v2, $"""SELECT assessment FROM public.consultations WHERE patient_id = '{auth0PatientId}' """))!.Length > 500);

        // Group B: prescription_documents + prescriptions linkage + invariant integer duration
        var rxDocId = await ScalarStringAsync(v2, $"""SELECT id::text FROM public.prescription_documents WHERE patient_id = '{auth0PatientId}' """);
        Assert.False(string.IsNullOrEmpty(rxDocId));
        Assert.Equal("Dr. ClinicianOne MD", await ScalarStringAsync(v2, $"""SELECT prescriber_name FROM public.prescription_documents WHERE id = '{rxDocId}' """));
        Assert.Equal("PRC-998877", await ScalarStringAsync(v2, $"""SELECT prescriber_prc_license FROM public.prescription_documents WHERE id = '{rxDocId}' """));
        Assert.Equal(rxDocId, await ScalarStringAsync(v2, $"""SELECT prescription_document_id::text FROM public.prescriptions WHERE patient_id = '{auth0PatientId}' """));
        Assert.Equal("5", await ScalarStringAsync(v2, $"""SELECT duration FROM public.prescriptions WHERE patient_id = '{auth0PatientId}' """));

        // Group B: medical_certificates real clinician name/PRC/PTR
        Assert.Equal("Dr. ClinicianOne MD", await ScalarStringAsync(v2, $"""SELECT doctor_name FROM public.medical_certificates WHERE patient_id = '{auth0PatientId}' """));
        Assert.Equal("PRC-998877", await ScalarStringAsync(v2, $"""SELECT doctor_prc_license FROM public.medical_certificates WHERE patient_id = '{auth0PatientId}' """));
        Assert.Equal("PTR-112233", await ScalarStringAsync(v2, $"""SELECT doctor_ptr_number FROM public.medical_certificates WHERE patient_id = '{auth0PatientId}' """));

        // Group B: lab_request_slips camelCase items_json roundtrip (Lab + Imaging + ECG = 3 slips)
        Assert.Equal(3L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.lab_request_slips WHERE patient_id = '{auth0PatientId}' """));
        var itemsJson = await ScalarStringAsync(v2, $"""SELECT items_json FROM public.lab_request_slips WHERE accession_number = 'V1-LAB-1' """);
        using (var doc = JsonDocument.Parse(itemsJson!))
        {
            var first = doc.RootElement[0];
            Assert.Equal("CBC-01", first.GetProperty("code").GetString());
            Assert.Equal("Complete Blood Count", first.GetProperty("name").GetString());
            Assert.Equal("Hematology", first.GetProperty("category").GetString());
        }

        // Group B: vital_signs source='ClinicV1'
        Assert.Equal("ClinicV1", await ScalarStringAsync(v2, $"""SELECT source FROM public.vital_signs WHERE patient_id = '{auth0PatientId}' """));

        // Idempotency: Run 2 MUST report 0 Created, 0 Updated, 0 Conflicts, ReadyToFreeze == true
        var run2 = await fx.Coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.Backfill, sampleLimit: null, forceV1OnConflict: false, triggeredBy: "test-t1-idem", ct: CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run2.Status);
        var sum2 = JsonSerializer.Deserialize<SyncRunSummary>(run2.Summary.GetRawText(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        Assert.All(sum2.Entities.Values, c =>
        {
            Assert.Equal(0, c.Created);
            Assert.Equal(0, c.Updated);
            Assert.Equal(0, c.SkippedV2Wins);
        });
        Assert.Equal(2, sum2.For("PatientAccount").Unchanged);

        var parity = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.True(parity.ReadyToFreeze);
        Assert.Equal(0, parity.OpenConflictsCount);
        Assert.All(parity.Checks, c => Assert.True(c.IsMatched, $"Expected {c.EntityType} parity matched"));
    }

    [Fact]
    public async Task T2_TruncationAlignmentNumericClampingAndClinicEzIdSalt_ProduceZeroErrorsAndZeroFalseConflicts()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateGlobalTrack2BindingAsync(fx, "Track2 Truncation & Collision Salt T2");

        // Pre-seed another patient holding the salt=0 ClinicEzId of user 2101 to force salt >= 1 retry!
        var collidingEzId = DeterministicUuid.GenerateClinicEzId(2101, 0);
        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, $"""
            INSERT INTO public.patients (id, client_id, clinic_ez_id, first_name, last_name, consent_to_share_info, created_by)
            VALUES ('{Guid.NewGuid()}', '{Guid.NewGuid()}', '{collidingEzId}', 'PreExisting', 'Collider', true, 'seed');
            """);

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."Dose" (id, dose) VALUES (1, 'DoseExceedingTwentyChars-1234567890');
            INSERT INTO public."Vaccine" (id, name, type) VALUES (1, 'MMR Vaccine', 'CHILD');
            INSERT INTO public."User" (id, "userId", "firstName", "lastName", nationality, religion, mobile, telephone, email, "isActive")
            VALUES (2101, 'auth0|t2_2101', 'Long', 'Strings',
                    repeat('N', 120), repeat('R', 120), '091712345678901234567890123', '08812345678901234567890',
                    repeat('e', 250) || '@example.test', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (5101, 101, 2101);
            INSERT INTO public."PersonalHistory" (id, "userId", "smokingStatus", "numberOfPacksPerYear", "alcoholStatus")
            VALUES (5101, 2101, 'FORMER', 99999.9, 'HEAVY');
            INSERT INTO public."UserVaccination" (id, "userId", "vaccineId", "doseId", "routeId", "dateGiven", "hpId")
            VALUES (5101, 2101, 1, 1, 1, '2026-01-01T00:00:00Z', NULL);
            INSERT INTO public."VitalSign" (id, "userId", "dateTaken", weight, height, bmi, temp, spo2)
            VALUES (5101, 2101, '2026-03-01T10:00:00Z', 1200.50, 12000.0, 259106.8435, 736.0, 989.0);
            """);

        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t2-1", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        await using var v2 = new NpgsqlConnection(fx.PatientConnectionString);
        await v2.OpenAsync();
        var pid2101 = DeterministicUuid.PatientAccountId(2101);

        var assignedEzId = await ScalarStringAsync(v2, $"""SELECT clinic_ez_id FROM public.patients WHERE id = '{pid2101}' """);
        Assert.NotEqual(collidingEzId, assignedEzId);
        Assert.Equal(DeterministicUuid.GenerateClinicEzId(2101, 1), assignedEzId);
        Assert.Equal(80, (await ScalarStringAsync(v2, $"""SELECT nationality FROM public.patients WHERE id = '{pid2101}' """))!.Length);
        Assert.Equal(20, (await ScalarStringAsync(v2, $"""SELECT mobile FROM public.patients WHERE id = '{pid2101}' """))!.Length);
        Assert.Equal(20, (await ScalarStringAsync(v2, $"""SELECT dose_number FROM public.patient_immunizations_self WHERE patient_id = '{pid2101}' """))!.Length);
        Assert.Equal("FormerSmoker", await ScalarStringAsync(v2, $"""SELECT smoking_status FROM public.patient_social_histories WHERE patient_id = '{pid2101}' """));
        Assert.Equal("Heavy", await ScalarStringAsync(v2, $"""SELECT alcohol_use FROM public.patient_social_histories WHERE patient_id = '{pid2101}' """));
        Assert.Null(await ScalarStringAsync(v2, $"""SELECT pack_years::text FROM public.patient_social_histories WHERE patient_id = '{pid2101}' """));
        Assert.Null(await ScalarStringAsync(v2, $"""SELECT weight_kg::text FROM public.vital_signs WHERE patient_id = '{pid2101}' """));
        Assert.Null(await ScalarStringAsync(v2, $"""SELECT height_cm::text FROM public.vital_signs WHERE patient_id = '{pid2101}' """));
        Assert.Null(await ScalarStringAsync(v2, $"""SELECT bmi::text FROM public.vital_signs WHERE patient_id = '{pid2101}' """));
        Assert.Null(await ScalarStringAsync(v2, $"""SELECT temperature_celsius::text FROM public.vital_signs WHERE patient_id = '{pid2101}' """));
        Assert.Null(await ScalarStringAsync(v2, $"""SELECT oxygen_saturation_percent::text FROM public.vital_signs WHERE patient_id = '{pid2101}' """));

        // Run 2 MUST see zero false V2_MODIFIED conflicts despite truncation!
        var run2 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t2-2", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run2.Status);
        var sum2 = JsonSerializer.Deserialize<SyncRunSummary>(run2.Summary.GetRawText(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        Assert.Equal(0, sum2.For("PatientAccount").SkippedV2Wins);
        Assert.Equal(1, sum2.For("PatientAccount").Unchanged);
        Assert.Equal(0, await fx.Ledger.CountOpenConflictsAsync(binding.Id));
    }

    [Fact]
    public async Task T3_AdoptedClerkUser_UnhashedV2Protection_And_ForceV1KeepV2AcrossGroupAAndB()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 v2-wins & Adopted Clerk T3");

        await SeedComprehensiveV1ClinicAndPatientDataAsync(fx.V1ConnectionString);

        // Pre-seed Clerk-created patient 2002 with a DIFFERENT UUIDv4 AND an un-hashed deterministic patient_addresses row
        var adoptedId = Guid.NewGuid();
        var unhashedAddrId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, "v1_addr:2");
        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, $"""
            INSERT INTO public.patients (id, client_id, clerk_user_id, clinic_ez_id, first_name, last_name, consent_to_share_info, created_by)
            VALUES ('{adoptedId}', '{adoptedId}', 'user_clerk_2002', 'CE-ADPT-2002', 'ClerkEdited', 'PatientTwo', true, 'clerk_self');
            INSERT INTO public.patient_addresses (id, client_id, patient_id, type, house_street, street_address, barangay, city_municipality, province, country, is_primary, created_by)
            VALUES ('{unhashedAddrId}', '{unhashedAddrId}', '{adoptedId}', 'Home', 'Native V2 Street', 'Native V2 Street', 'Brgy Native', 'Cagayan de Oro', 'Misamis Oriental', 'Philippines', true, 'patient_self');
            """);

        // Run 1: adopts Clerk 2002 (AdoptedExisting=1) & protects un-hashed PatientAddress (SkippedV2Wins=1)
        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t3-1", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);
        var sum1 = JsonSerializer.Deserialize<SyncRunSummary>(run1.Summary.GetRawText(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        Assert.Equal(1, sum1.For("PatientAccount").AdoptedExisting);
        Assert.Equal(1, sum1.For("PatientAddress").SkippedV2Wins);

        await using var v2 = new NpgsqlConnection(fx.PatientConnectionString);
        await v2.OpenAsync();
        Assert.Equal("ClerkEdited", await ScalarStringAsync(v2, $"""SELECT first_name FROM public.patients WHERE id = '{adoptedId}' """));
        Assert.Equal("Native V2 Street", await ScalarStringAsync(v2, $"""SELECT house_street FROM public.patient_addresses WHERE id = '{unhashedAddrId}' """));

        // Verify repeat sync updates adopted Clerk user when v1 changes and v2 was NOT modified since adoption
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."User" SET "middleName" = 'UpdatedMid' WHERE id = 2002;
            UPDATE public."ClinicMedicalCertificate" SET remarks = 'Updated MedCert V1' WHERE id = 1;
            """);
        var run2 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t3-2", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run2.Status);
        Assert.Equal("UpdatedMid", await ScalarStringAsync(v2, $"""SELECT middle_name FROM public.patients WHERE id = '{adoptedId}' """));

        // Now edit adopted Clerk user AND Group B MedicalCertificate in v2, AND mutate v1 -> triggers V2_MODIFIED!
        var certId = DeterministicUuid.SharedMedicalCertificateId(V2ClinicId, 1);
        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, $"""
            UPDATE public.patients SET first_name = 'V2DirectEdit' WHERE id = '{adoptedId}';
            UPDATE public.medical_certificates SET remarks = 'V2 Cert Edit' WHERE id = '{certId}';
            """);
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."User" SET "firstName" = 'V1ClerkOverwrite' WHERE id = 2002;
            UPDATE public."ClinicMedicalCertificate" SET remarks = 'V1 Cert Overwrite' WHERE id = 1;
            """);

        var run3 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t3-3", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run3.Status);
        Assert.Equal("V2DirectEdit", await ScalarStringAsync(v2, $"""SELECT first_name FROM public.patients WHERE id = '{adoptedId}' """));
        Assert.Equal("V2 Cert Edit", await ScalarStringAsync(v2, $"""SELECT remarks FROM public.medical_certificates WHERE id = '{certId}' """));

        var (conflicts, _) = await fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, 50, 0);
        var acctConflict = Assert.Single(conflicts, c => c.EntityType == "PatientAccount" && c.V1Id == "2002");
        var addrConflict = Assert.Single(conflicts, c => c.EntityType == "PatientAddress" && c.V1Id == "2");
        var certConflict = Assert.Single(conflicts, c => c.EntityType == "PatientMedicalCertificate" && c.V1Id == "1");

        // FORCE_V1 on adopted PatientAccount & Group B MedicalCertificate updates v2!
        var forceAcct = await fx.Coordinator.ResolveConflictAsync(acctConflict.Id, "FORCE_V1", "reviewer", CancellationToken.None);
        Assert.Equal(SyncConflictStatus.ResolvedForceV1, forceAcct!.Conflict.Status);
        Assert.Equal("V1ClerkOverwrite", await ScalarStringAsync(v2, $"""SELECT first_name FROM public.patients WHERE id = '{adoptedId}' """));

        var forceCert = await fx.Coordinator.ResolveConflictAsync(certConflict.Id, "FORCE_V1", "reviewer", CancellationToken.None);
        Assert.Equal(SyncConflictStatus.ResolvedForceV1, forceCert!.Conflict.Status);
        Assert.Equal("V1 Cert Overwrite", await ScalarStringAsync(v2, $"""SELECT remarks FROM public.medical_certificates WHERE id = '{certId}' """));

        // KEEP_V2 on un-hashed PatientAddress updates sync_row_hashes so next run does NOT re-open conflict!
        var keepAddr = await fx.Coordinator.ResolveConflictAsync(addrConflict.Id, "KEEP_V2", "reviewer", CancellationToken.None);
        Assert.Equal(SyncConflictStatus.ResolvedKeepV2, keepAddr!.Conflict.Status);
        Assert.Equal("Native V2 Street", await ScalarStringAsync(v2, $"""SELECT house_street FROM public.patient_addresses WHERE id = '{unhashedAddrId}' """));

        var run4 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t3-4", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run4.Status);
        Assert.Equal(0, await fx.Ledger.CountOpenConflictsAsync(binding.Id));
    }

    [Fact]
    public async Task T4_NaturalKeyInteropAdoption_And_VitalSignClinicAttributionAndFkGuard()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 Interop Adoption & Vitals T4");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."Clinic" (id, name) VALUES (101, 'Clinic 101'), (102, 'Clinic 102');
            INSERT INTO public."User" (id, "userId", "firstName", "lastName", "isActive")
            VALUES
                (3001, 'auth0|single_c101', 'Single', 'ClinicUser', true),
                (3002, 'auth0|multi_c101_c102', 'Multi', 'ClinicUser', true),
                (3003, 'auth0|org_only', 'OrgOnly', 'User', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES
                (6001, 101, 3001),
                (6002, 101, 3002),
                (6003, 102, 3002);
            INSERT INTO public."OrganizationMember" (id, "organizationId", "userId") VALUES (7003, 201, 3003);

            INSERT INTO public."HealthcareProvider" (id, "userId") VALUES (701, 3001);
            INSERT INTO public."HPProfile" (id, "healthcareProviderId", title, name, suffix) VALUES (1, 701, 'Dr.', 'ClinicianOne', 'MD');
            INSERT INTO public."ProfessionalDetails" (id, "healthcareProverId", "licenseNumber", "ptrNumber") VALUES (1, 701, 'PRC-998877', 'PTR-112233');

            INSERT INTO public."ConsultationTicket" (id, "clinicId", "clinicPatientId", subject, "isActive")
            VALUES
                (901, 101, 6001, 'Active Consult', true),
                (902, 101, 6001, 'Unsynced Consult', true);
            INSERT INTO public."Prescription" (id, "clinicId", "patientId", "consultationTicketId", "hpId", "serialNumber", remarks)
            VALUES (1, 101, 6001, 901, 701, 'RX-1', 'Take daily');
            INSERT INTO public."ClinicMedicalCertificate" (id, "clinicId", "clinicPatientId", "consultationTicketId", "hpId", "serialNumber", impression, remarks)
            VALUES (1, 101, 6001, 901, 701, 'MC-1', 'Healthy', 'Interop test');
            INSERT INTO public."ClinicLaboratoryProcedure" (id, name, category, "rvsCode") VALUES (1, 'CBC', 'Hematology', 'CBC-1');
            INSERT INTO public."ClinicLaboratoryRequest" (id, "clinicId", "clinicPatientId", "consultationTicketId", "hpId", "serialNumber")
            VALUES (1, 101, 6001, 901, 701, 'LAB-1');
            INSERT INTO public."ClinicLaboratoryRequestProcedure" (id, "clinicLaboratoryRequestId", "clinicLaboratoryProcedureId") VALUES (1, 1, 1);

            -- NULL-ticket vitals across single-clinic, multi-clinic, and 0-clinic users, plus ticket 902 vital for FK guard test
            INSERT INTO public."VitalSign" (id, "userId", "consultationTicketId", "dateTaken", "bpSystolic", "bpDiastolic")
            VALUES
                (8001, 3001, NULL, '2026-03-01T08:00:00Z', 120, 80),
                (8002, 3002, NULL, '2026-03-01T09:00:00Z', 130, 85),
                (8003, 3003, NULL, '2026-03-01T10:00:00Z', 110, 70),
                (8004, 3001, 902, '2026-03-01T11:00:00Z', 118, 76);
            """);

        // Pre-seed Interop rows in v2 with random PKs matching natural unique keys
        var pid3001 = DeterministicUuid.PatientAccountId(3001);
        var interopMembershipId = Guid.NewGuid();
        var interopRxDocId = Guid.NewGuid();
        var interopCertId = Guid.NewGuid();
        var interopSlipId = Guid.NewGuid();

        var rxBizId = DeterministicUuid.Create(DeterministicUuid.SharedClinicalNamespace, $"clinic:{V2ClinicId:D}:v1_rxdoc:1");
        var certBizId = DeterministicUuid.SharedMedicalCertificateId(V2ClinicId, 1);
        var reqBizId = DeterministicUuid.SharedLabOrderId(V2ClinicId, "lab", 1);

        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, $"""
            INSERT INTO public.clinics (id, name, tenant_id, specialties_json, required_share_fields_json)
            VALUES ('{V2ClinicId}', 'Clinic 101', '{V2TenantId}', '[]', '[]');
            INSERT INTO public.patients (id, client_id, clinic_ez_id, first_name, last_name, consent_to_share_info, created_by)
            VALUES ('{pid3001}', '{pid3001}', '{DeterministicUuid.GenerateClinicEzId(3001)}', 'Single', 'ClinicUser', true, 'interop');
            INSERT INTO public.clinic_memberships (id, client_id, patient_id, clinic_id, status, consent_privacy_policy, consent_terms_and_conditions, consent_data_sharing, created_by)
            VALUES ('{interopMembershipId}', '{interopMembershipId}', '{pid3001}', '{V2ClinicId}', 'Active', true, true, true, 'interop');
            INSERT INTO public.prescription_documents (id, patient_id, prescription_id, prescription_number, ordering_tenant_id, ordering_facility_id, ordering_facility_name, prescriber_name, prescriber_prc_license, stage, issued_at, has_details, created_by)
            VALUES ('{interopRxDocId}', '{pid3001}', '{rxBizId}', 'RX-INTEROP', '{V2TenantId}', '{V2ClinicId}', 'Clinic 101', 'Dr. ClinicianOne MD', 'PRC-998877', 'Issued', now(), true, 'interop');
            INSERT INTO public.medical_certificates (id, patient_id, certificate_id, certificate_number, issuer_tenant_id, issuer_facility_id, issuer_name, doctor_name, doctor_prc_license, purpose, issued_at, created_by)
            VALUES ('{interopCertId}', '{pid3001}', '{certBizId}', 'MC-INTEROP', '{V2TenantId}', '{V2ClinicId}', 'Clinic 101', 'Dr. ClinicianOne MD', 'PRC-998877', 'Medical Clearance', now(), 'interop');
            INSERT INTO public.lab_request_slips (id, patient_id, requisition_id, ordering_tenant_id, ordering_facility_id, ordering_facility_name, accession_number, title, urgency, items_json, stage, payment_required, issued_at, has_details, created_by)
            VALUES ('{interopSlipId}', '{pid3001}', '{reqBizId}', '{V2TenantId}', '{V2ClinicId}', 'Clinic 101', 'V1-LAB-1', 'CBC', 'Routine', '[]', 'Issued', false, now(), true, 'interop');
            """);

        // Run with forceV1OnConflict=false: ZERO 23505 duplicate key errors; existing natural-key PKs adopted or protected via v2-wins!
        var run = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t4", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run.Status);

        var membershipMap = await fx.Ledger.GetIdMappingsByV1IdsAsync(binding.Id, "ClinicMembership", new[] { "6001" });
        Assert.Equal(interopMembershipId, membershipMap["6001"]);

        var (conflicts, _) = await fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, 50, 0);
        var rxConflict = Assert.Single(conflicts, c => c.EntityType == "PatientPrescriptionDocument" && c.V1Id == "1");
        var certConflict = Assert.Single(conflicts, c => c.EntityType == "PatientMedicalCertificate" && c.V1Id == "1");
        var slipConflict = Assert.Single(conflicts, c => c.EntityType == "PatientLabRequestSlip" && c.V1Id == "lab:1");
        Assert.Equal(interopRxDocId, rxConflict.V2Id);
        Assert.Equal(interopCertId, certConflict.V2Id);
        Assert.Equal(interopSlipId, slipConflict.V2Id);

        // Resolving FORCE_V1 updates the adopted Interop row in place (zero duplicate rows!) & records sync_id_map
        await fx.Coordinator.ResolveConflictAsync(rxConflict.Id, "FORCE_V1", "test-t4", CancellationToken.None);
        var rxDocMap = await fx.Ledger.GetIdMappingsByV1IdsAsync(binding.Id, "PatientPrescriptionDocument", new[] { "1" });
        Assert.Equal(interopRxDocId, rxDocMap["1"]);

        await using var v2 = new NpgsqlConnection(fx.PatientConnectionString);
        await v2.OpenAsync();
        Assert.Equal(1L, await ScalarInt64Async(v2, "SELECT COUNT(*) FROM public.prescription_documents"));
        Assert.Equal("RX-1-V1-1", await ScalarStringAsync(v2, $"""SELECT prescription_number FROM public.prescription_documents WHERE id = '{interopRxDocId}' """));

        // VitalSign attribution checks
        Assert.Equal(V2ClinicId.ToString("D"), await ScalarStringAsync(v2, $"""SELECT clinic_id::text FROM public.vital_signs WHERE id = '{DeterministicUuid.SharedVitalsId(V2ClinicId, 8001)}' """));
        Assert.Equal("ClinicV1", await ScalarStringAsync(v2, $"""SELECT source FROM public.vital_signs WHERE id = '{DeterministicUuid.SharedVitalsId(V2ClinicId, 8001)}' """));

        Assert.Equal(Guid.Empty.ToString("D"), await ScalarStringAsync(v2, $"""SELECT clinic_id::text FROM public.vital_signs WHERE id = '{DeterministicUuid.SharedVitalsId(Guid.Empty, 8002)}' """));
        Assert.Equal("PatientSelf", await ScalarStringAsync(v2, $"""SELECT source FROM public.vital_signs WHERE id = '{DeterministicUuid.SharedVitalsId(Guid.Empty, 8002)}' """));

        Assert.Equal(Guid.Empty.ToString("D"), await ScalarStringAsync(v2, $"""SELECT clinic_id::text FROM public.vital_signs WHERE id = '{DeterministicUuid.SharedVitalsId(Guid.Empty, 8003)}' """));
        Assert.Equal("PatientSelf", await ScalarStringAsync(v2, $"""SELECT source FROM public.vital_signs WHERE id = '{DeterministicUuid.SharedVitalsId(Guid.Empty, 8003)}' """));

        // Delete consultation 902 in v2 and re-sync VitalSign 8004 via ForceSyncEntityAsync -> consultation_id falls back to NULL without FK crash!
        var detConsult902 = DeterministicUuid.SharedConsultationId(V2ClinicId, 902);
        var vital8004Id = DeterministicUuid.SharedVitalsId(V2ClinicId, 8004);
        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, $"""
            DELETE FROM public.vital_signs WHERE id = '{vital8004Id}';
            DELETE FROM public.consultations WHERE id = '{detConsult902}';
            """);
        await fx.Track2.ForceSyncEntityAsync(binding, "PatientVitalSign", "8004", vital8004Id, "test-t4-fk", CancellationToken.None);
        Assert.Null(await ScalarStringAsync(v2, $"""SELECT consultation_id::text FROM public.vital_signs WHERE id = '{vital8004Id}' """));
    }

    [Fact]
    public async Task T5_ScopedCdcMultiHop_Over5000HasMoreDrain_And_FinalSweep()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 MultiHop CDC & FinalSweep T5");

        await SeedComprehensiveV1ClinicAndPatientDataAsync(fx.V1ConnectionString);

        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t5-init", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        // Emit >5000 noise changelog rows + real multi-hop CDC mutations (Prescription, Medicine, MedicationDrug, LabProc, ConsultationNote, VitalSign)
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO _v1_sync.changelog (table_name, op, row_id, pk_json)
            SELECT 'System', 'U', (90000 + g)::text, jsonb_build_object('id', 90000 + g)
            FROM generate_series(1, 5150) AS g;

            UPDATE public."Prescription" SET remarks = 'CDC Updated Rx Instructions' WHERE id = 1;
            UPDATE public."Medicine" SET dosage = '1000mg', "updatedAt" = now() WHERE id = 1;
            UPDATE public."MedicationDrug" SET frequency = 'Twice daily' WHERE id = 1;
            UPDATE public."ClinicLaboratoryRequestProcedure" SET "clinicLaboratoryProcedureId" = 1 WHERE id = 1;
            UPDATE public."ClinicMedicalCertificate" SET remarks = 'CDC Updated Cert Remark' WHERE id = 1;
            UPDATE public."VitalSign" SET "bpSystolic" = 128 WHERE id = 1;
            """);

        var incRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Incremental, null, false, "test-t5-cdc", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, incRun.Status);

        var parity1 = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.Equal(0L, parity1.ChangelogLag);

        await using var v2 = new NpgsqlConnection(fx.PatientConnectionString);
        await v2.OpenAsync();
        var pid2001 = DeterministicUuid.PatientAccountId(2001);
        Assert.Equal("CDC Updated Rx Instructions", await ScalarStringAsync(v2, $"""SELECT instructions FROM public.prescription_documents WHERE patient_id = '{pid2001}' """));
        Assert.Equal("1000mg", await ScalarStringAsync(v2, $"""SELECT dosage FROM public.prescriptions WHERE patient_id = '{pid2001}' """));
        Assert.Equal("Twice daily", await ScalarStringAsync(v2, $"""SELECT frequency FROM public.patient_medications WHERE patient_id = '{pid2001}' """));
        Assert.Equal("CDC Updated Cert Remark", await ScalarStringAsync(v2, $"""SELECT remarks FROM public.medical_certificates WHERE patient_id = '{pid2001}' """));
        Assert.Equal(128L, await ScalarInt64Async(v2, $"""SELECT systolic_bp FROM public.vital_signs WHERE patient_id = '{pid2001}' """));

        // FinalSweep pre-drain + full sweep + post-drain
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."User" SET "firstName" = 'FinalSweepName' WHERE id = 2002;
            """);
        var sweepRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.FinalSweep, null, false, "test-t5-sweep", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, sweepRun.Status);
        Assert.Equal("FinalSweepName", await ScalarStringAsync(v2, $"""SELECT first_name FROM public.patients WHERE id = '{DeterministicUuid.PatientAccountId(2002)}' """));

        var parity2 = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.Equal(0L, parity2.ChangelogLag);
        Assert.True(parity2.ReadyToFreeze);
    }

    [Fact]
    public async Task T6_DeletionShield_CdcDeletes_SoftDeletePostMutation_FinalSweep_And_ManualFreeze()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 Deletion Shield & Freeze T6");

        await SeedComprehensiveV1ClinicAndPatientDataAsync(fx.V1ConnectionString);

        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t6-init", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        // Hard-delete Medication, Prescription, LabRequest, UserVaccination (self & admin), File; soft-delete User 2002 + post-delete UserAddress edit!
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            DELETE FROM public."MedicationDrug" WHERE id = 1;
            DELETE FROM public."Medication" WHERE id = 1;
            DELETE FROM public."MedicineDispenseRecord" WHERE id = 1;
            DELETE FROM public."Medicine" WHERE id = 1;
            DELETE FROM public."Prescription" WHERE id = 1;
            DELETE FROM public."ClinicLaboratoryRequestProcedure" WHERE id = 1;
            DELETE FROM public."ClinicLaboratoryRequest" WHERE id = 1;
            DELETE FROM public."UserVaccination" WHERE id IN (1, 2);
            DELETE FROM public."File" WHERE id = 1;
            UPDATE public."User" SET "deletedAt" = now() WHERE id = 2002;
            UPDATE public."UserAddress" SET "addressLine" = 'Post-Delete Mutated St' WHERE id = 2;
            """);

        var incRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Incremental, null, false, "test-t6-cdc", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, incRun.Status);

        await using var v2 = new NpgsqlConnection(fx.PatientConnectionString);
        await v2.OpenAsync();

        var pid2001 = DeterministicUuid.PatientAccountId(2001);
        var pid2002 = DeterministicUuid.PatientAccountId(2002);

        // ALL deleted v1 entities MUST remain preserved (is_deleted = false) in CLINICEZ-PATIENT_DB!
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.patients WHERE id = '{pid2002}' AND is_deleted = false"""));
        Assert.Equal("200 Secondary St", await ScalarStringAsync(v2, $"""SELECT house_street FROM public.patient_addresses WHERE patient_id = '{pid2002}' """));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.patient_medications WHERE patient_id = '{pid2001}' AND is_deleted = false"""));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.prescription_documents WHERE patient_id = '{pid2001}' AND is_deleted = false"""));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.prescriptions WHERE patient_id = '{pid2001}' AND is_deleted = false"""));
        Assert.Equal(3L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.lab_request_slips WHERE patient_id = '{pid2001}' AND is_deleted = false"""));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.patient_immunizations_self WHERE patient_id = '{pid2001}' AND is_deleted = false"""));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.vaccinations_administered WHERE patient_id = '{pid2001}' AND is_deleted = false"""));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.file_records WHERE patient_id = '{pid2001}' AND is_deleted = false"""));

        var (conflicts, _) = await fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, 100, 0);
        Assert.Contains(conflicts, c => c.EntityType == "PatientAccount" && c.V1Id == "2002" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(conflicts, c => c.EntityType == "PatientMedication" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(conflicts, c => c.EntityType == "PatientPrescriptionDocument" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(conflicts, c => c.EntityType == "PatientPrescription" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(conflicts, c => c.EntityType == "PatientLabRequestSlip" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(conflicts, c => c.EntityType == "PatientImmunizationSelf" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(conflicts, c => c.EntityType == "VaccinationAdministered" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(conflicts, c => c.EntityType == "FileRecord" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);

        // FinalSweep also shields deleted user 2002 and preserves v2 row
        var sweepRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.FinalSweep, null, false, "test-t6-sweep", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, sweepRun.Status);
        var sweepSum = JsonSerializer.Deserialize<SyncRunSummary>(sweepRun.Summary.GetRawText(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        Assert.True(sweepSum.For("PatientAccount").ShieldedDeletes >= 1);

        // Manual-only FREEZE blocks further syncs
        var frozen = await fx.Coordinator.FreezeBindingAsync(binding.Id, "admin-freeze", "Cutover complete", CancellationToken.None);
        Assert.NotNull(frozen);
        Assert.True(frozen!.IsFrozen);

        Func<Task> runAfterFreeze = () => fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Incremental, null, false, "test-t6-frozen", CancellationToken.None);
        await runAfterFreeze.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task T7_ScopedParityAccuracy_And_PhiSafeErrorSanitization()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 Parity & Error Sanitization T7");

        await SeedComprehensiveV1ClinicAndPatientDataAsync(fx.V1ConnectionString);

        // Seed an out-of-scope patient directly in v2 (e.g. Clinic 999) — scoped parity MUST ignore them!
        var outOfScopeId = Guid.NewGuid();
        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, $"""
            INSERT INTO public.patients (id, client_id, clinic_ez_id, first_name, last_name, consent_to_share_info, created_by)
            VALUES ('{outOfScopeId}', '{outOfScopeId}', 'CE-OUTS-9999', 'Other', 'ClinicPatient', true, 'other');
            """);

        await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t7-init", CancellationToken.None);

        var parityOk = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.True(parityOk.ReadyToFreeze);
        var patCheck = Assert.Single(parityOk.Checks, c => c.EntityType == "Patients");
        Assert.Equal(2L, patCheck.V1ExpectedCount);
        Assert.Equal(2L, patCheck.V2ActualCount);

        // Delete 1 patient_medications row directly in v2 -> parity MUST fail on PatientMedications & block ReadyToFreeze!
        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, "DELETE FROM public.patient_medications;");
        var parityMismatch = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.False(parityMismatch.ReadyToFreeze);
        var medCheck = Assert.Single(parityMismatch.Checks, c => c.EntityType == "PatientMedications");
        Assert.Equal(1L, medCheck.V1ExpectedCount);
        Assert.Equal(0L, medCheck.V2ActualCount);
        Assert.False(medCheck.IsMatched);

        // FinalSweep heals missing row
        await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.FinalSweep, null, false, "test-t7-heal", CancellationToken.None);
        var parityHealed = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.True(parityHealed.ReadyToFreeze);

        // PHI-safe error sanitization in sync_runs.error_message
        var dummyRunId = await fx.Ledger.StartRunAsync(binding.Id, SyncRunMode.Incremental, 1, "test-t7-phi");
        var phiEx = new PostgresException("duplicate key violates constraint; patient email john.doe.phi@example.test", "ERROR", "ERROR", "23505",
            constraintName: "ix_patients_clinic_ez_id", detail: "Key (email)=(john.doe.phi@example.test) already exists.");
        await fx.Ledger.FailRunAsync(dummyRunId, new SyncRunSummary { Track = SyncTrack.Track2Patient, Mode = SyncRunMode.Incremental }, phiEx);

        var runs = await fx.Ledger.ListRunsAsync(binding.Id, 10);
        var failed = Assert.Single(runs, r => r.Id == dummyRunId);
        Assert.Equal(SyncRunStatus.Failed, failed.Status);
        Assert.DoesNotContain("john.doe.phi", failed.ErrorMessage ?? string.Empty);
        Assert.Contains("23505", failed.ErrorMessage);
    }

    [Fact]
    public async Task T8_BuildParityReportAsync_SucceedsForSingleScopeClinicOnlyAndOrgOnlyBindings()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        await SeedComprehensiveV1ClinicAndPatientDataAsync(fx.V1ConnectionString);

        // 1. V1ClinicId-only scoped binding (V1OrgId = null)
        var clinicOnlyBinding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track2Patient,
            Name: "Track2 ClinicOnly Scoped T8",
            V1ClinicId: V1ClinicId,
            V1OrgId: null,
            V2TenantId: V2TenantId,
            V2ClinicId: V2ClinicId,
            PatientCohortMode: SyncCohortMode.Scoped), "test-t8");

        var clinicRun = await fx.Coordinator.ExecuteAsync(
            clinicOnlyBinding.Id, SyncRunMode.Backfill, null, false, "test-t8-clinic", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, clinicRun.Status);

        var clinicParity = await fx.Coordinator.GetParityReportAsync(clinicOnlyBinding.Id, CancellationToken.None);
        Assert.True(clinicParity.ReadyToFreeze);
        var clinicPatCheck = Assert.Single(clinicParity.Checks, c => c.EntityType == "Patients");
        Assert.Equal(2L, clinicPatCheck.V1ExpectedCount);
        Assert.Equal(2L, clinicPatCheck.V2ActualCount);
        Assert.Contains(clinicParity.Checks, c => c.EntityType == "ClinicMemberships" && c.IsMatched);

        // 2. V1OrgId-only scoped binding (V1ClinicId = null, V2ClinicId = null)
        var orgOnlyBinding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track2Patient,
            Name: "Track2 OrgOnly Scoped T8",
            V1ClinicId: null,
            V1OrgId: V1OrgId,
            V2TenantId: V2TenantId,
            V2ClinicId: null,
            PatientCohortMode: SyncCohortMode.Scoped), "test-t8");

        var orgRun = await fx.Coordinator.ExecuteAsync(
            orgOnlyBinding.Id, SyncRunMode.Backfill, null, false, "test-t8-org", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, orgRun.Status);

        var orgParity = await fx.Coordinator.GetParityReportAsync(orgOnlyBinding.Id, CancellationToken.None);
        Assert.True(orgParity.ReadyToFreeze);
        var orgPatCheck = Assert.Single(orgParity.Checks, c => c.EntityType == "Patients");
        Assert.Equal(2L, orgPatCheck.V1ExpectedCount);
        Assert.Equal(2L, orgPatCheck.V2ActualCount);
    }

    [Fact]
    public async Task T9_PrescriptionDocument_PartialDispenseRemainsIssued_AllDispensedBecomesDispensed()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 Partial Dispense T9");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."Clinic" (id, name) VALUES (101, 'Clinic 101') ON CONFLICT (id) DO NOTHING;
            INSERT INTO public."User" (id, "userId", "firstName", "lastName", "isActive")
            VALUES
                (4001, 'auth0|rx_4001', 'Synth', 'RxUser', true),
                (4002, 'auth0|doc_4002', 'Doctor', 'Prescriber', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (4501, 101, 4001);
            INSERT INTO public."HealthcareProvider" (id, "userId") VALUES (4701, 4002);
            INSERT INTO public."HPProfile" (id, "healthcareProviderId", title, name, suffix) VALUES (1, 4701, 'Dr.', 'Prescriber', 'MD');
            INSERT INTO public."ProfessionalDetails" (id, "healthcareProverId", "licenseNumber") VALUES (1, 4701, 'PRC-4002');
            INSERT INTO public."ConsultationTicket" (id, "clinicId", "clinicPatientId", subject, "isActive")
            VALUES (4901, 101, 4501, 'Rx Consult', true);

            -- Partial Rx: 2 active medicines, only Med 1 has MedicineDispenseRecord(isDispensed=true), Med 2 has NULL
            INSERT INTO public."Prescription" (id, "clinicId", "patientId", "consultationTicketId", "hpId", "serialNumber", remarks)
            VALUES
                (101, 101, 4501, 4901, 4701, 'RX-PARTIAL', 'Partial dispense'),
                (102, 101, 4501, 4901, 4701, 'RX-FULL', 'Full dispense');

            INSERT INTO public."Medicine" (id, "prescriptionId", name, "genericName", dosage, frequency, unit, duration, qty)
            VALUES
                (1001, 101, 'Med A', 'Gen A', '500mg', 'BID', 'tab', 5, 10),
                (1002, 101, 'Med B', 'Gen B', '250mg', 'OD', 'tab', 5, 5),
                (1003, 102, 'Med C', 'Gen C', '100mg', 'OD', 'tab', 7, 7),
                (1004, 102, 'Med D', 'Gen D', '200mg', 'BID', 'tab', 7, 14);

            INSERT INTO public."MedicineDispenseRecord" (id, "medicineId", "isDispensed")
            VALUES
                (1, 1001, true),
                (2, 1003, true),
                (3, 1004, true);
            """);

        var run = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t9", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run.Status);

        await using var v2 = new NpgsqlConnection(fx.PatientConnectionString);
        await v2.OpenAsync();
        Assert.Equal("Issued", await ScalarStringAsync(v2, "SELECT stage FROM public.prescription_documents WHERE prescription_number = 'RX-PARTIAL-V1-101'"));
        Assert.Equal("Dispensed", await ScalarStringAsync(v2, "SELECT stage FROM public.prescription_documents WHERE prescription_number = 'RX-FULL-V1-102'"));
    }

    [Fact]
    public async Task T10_KeepV2OnUnhashedInteropRow_PopulatesSyncIdMapAndProtectsSubsequentDelete()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 KEEP_V2 sync_id_map T10");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."Clinic" (id, name) VALUES (101, 'Clinic 101') ON CONFLICT (id) DO NOTHING;
            INSERT INTO public."User" (id, "userId", "firstName", "lastName", "isActive")
            VALUES
                (5001, 'auth0|interop_5001', 'Synth', 'InteropRx', true),
                (5002, 'auth0|doc_5002', 'Doctor', 'InteropDoc', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (5501, 101, 5001);
            INSERT INTO public."HealthcareProvider" (id, "userId") VALUES (5701, 5002);
            INSERT INTO public."HPProfile" (id, "healthcareProviderId", title, name, suffix) VALUES (1, 5701, 'Dr.', 'InteropDoc', 'MD');
            INSERT INTO public."ProfessionalDetails" (id, "healthcareProverId", "licenseNumber") VALUES (1, 5701, 'PRC-5002');
            INSERT INTO public."ConsultationTicket" (id, "clinicId", "clinicPatientId", subject, "isActive")
            VALUES (5901, 101, 5501, 'Interop Consult', true);
            INSERT INTO public."Prescription" (id, "clinicId", "patientId", "consultationTicketId", "hpId", "serialNumber", remarks)
            VALUES (201, 101, 5501, 5901, 5701, 'RX-V1-201', 'V1 diverging remarks');
            """);

        // Pre-seed diverging Interop prescription_documents row without any ledger hash/map
        var pid5001 = DeterministicUuid.PatientAccountId(5001);
        var interopRxDocId = Guid.NewGuid();
        var rxBizId = DeterministicUuid.Create(DeterministicUuid.SharedClinicalNamespace, $"clinic:{V2ClinicId:D}:v1_rxdoc:201");
        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, $"""
            INSERT INTO public.clinics (id, name, tenant_id, specialties_json, required_share_fields_json)
            VALUES ('{V2ClinicId}', 'Clinic 101', '{V2TenantId}', '[]', '[]');
            INSERT INTO public.patients (id, client_id, clinic_ez_id, first_name, last_name, consent_to_share_info, created_by)
            VALUES ('{pid5001}', '{pid5001}', '{DeterministicUuid.GenerateClinicEzId(5001)}', 'Synth', 'InteropRx', true, 'interop');
            INSERT INTO public.prescription_documents (
                id, patient_id, prescription_id, prescription_number, ordering_tenant_id, ordering_facility_id,
                ordering_facility_name, prescriber_name, prescriber_prc_license, instructions, stage, issued_at, has_details, created_by
            ) VALUES (
                '{interopRxDocId}', '{pid5001}', '{rxBizId}', 'RX-INTEROP-201', '{V2TenantId}', '{V2ClinicId}',
                'Clinic 101', 'Dr. InteropDoc MD', 'PRC-5002', 'Native V2 instructions', 'Issued', now(), true, 'interop'
            );
            """);

        // Run 1: opens V2_MODIFIED conflict for PatientPrescriptionDocument (sync_id_map not populated yet)
        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t10-1", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        var (conflicts, _) = await fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, 50, 0);
        var rxConflict = Assert.Single(conflicts, c => c.EntityType == "PatientPrescriptionDocument" && c.V1Id == "201");

        // Resolve KEEP_V2 -> sync_id_map MUST be populated immediately!
        var keepRes = await fx.Coordinator.ResolveConflictAsync(rxConflict.Id, "KEEP_V2", "test-t10-keep", CancellationToken.None);
        Assert.Equal(SyncConflictStatus.ResolvedKeepV2, keepRes!.Conflict.Status);

        var idMapAfterKeep = await fx.Ledger.GetIdMappingsByV1IdsAsync(binding.Id, "PatientPrescriptionDocument", new[] { "201" });
        Assert.True(idMapAfterKeep.ContainsKey("201"));
        Assert.Equal(interopRxDocId, idMapAfterKeep["201"]);

        var parityAfterKeep = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        var rxDocCheck = Assert.Single(parityAfterKeep.Checks, c => c.EntityType == "PrescriptionDocuments");
        Assert.Equal(1L, rxDocCheck.MappedLedgerCount);

        // Re-run Backfill -> zero open conflicts, MappedLedgerCount remains 1, V2 value preserved
        var run2 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t10-2", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run2.Status);
        Assert.Equal(0, await fx.Ledger.CountOpenConflictsAsync(binding.Id));
        var parityAfterBackfill = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.Equal(1L, Assert.Single(parityAfterBackfill.Checks, c => c.EntityType == "PrescriptionDocuments").MappedLedgerCount);

        // Subsequent op='D' on Prescription 201 MUST be caught by Deletion Shield using sync_id_map!
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, "DELETE FROM public.\"Prescription\" WHERE id = 201;");
        var incRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Incremental, null, false, "test-t10-del", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, incRun.Status);

        await using var v2 = new NpgsqlConnection(fx.PatientConnectionString);
        await v2.OpenAsync();
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.prescription_documents WHERE id = '{interopRxDocId}' AND is_deleted = false"""));

        var (shieldConflicts, _) = await fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, 50, 0);
        Assert.Contains(shieldConflicts, c =>
            c.EntityType == "PatientPrescriptionDocument" &&
            c.V1Id == "201" &&
            c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
    }

    [Fact]
    public async Task T11_IncrementalCdcDeleteOnUserAddress_EmitsSingleShieldDeleteDiffAndCount()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 Single SHIELD_DELETE T11");

        await SeedComprehensiveV1ClinicAndPatientDataAsync(fx.V1ConnectionString);

        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t11-init", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        // Hard-delete a single UserAddress row (id=1, userId=2001)
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, "DELETE FROM public.\"UserAddress\" WHERE id = 1;");

        var incRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Incremental, null, false, "test-t11-cdc", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, incRun.Status);

        var sum = JsonSerializer.Deserialize<SyncRunSummary>(incRun.Summary.GetRawText(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        Assert.Equal(1, sum.For("PatientAddress").ShieldedDeletes);

        var (diffs, _) = await fx.Ledger.ListRunDiffsAsync(incRun.Id, 100, 0);
        var shieldDiffs = diffs.Where(d =>
            d.EntityType == "PatientAddress" &&
            d.V1Id == "1" &&
            d.Action == SyncDiffAction.ShieldDelete).ToList();
        Assert.Single(shieldDiffs);

        await using var v2 = new NpgsqlConnection(fx.PatientConnectionString);
        await v2.OpenAsync();
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public.patient_addresses WHERE patient_id = '{DeterministicUuid.PatientAccountId(2001)}' AND is_deleted = false"""));
    }

    [Fact]
    public async Task T12_ForceSyncEntityAsync_SucceedsOnUnhashedEqualV2Rows()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 ForceSync Unhashed Equal T12");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."Clinic" (id, name) VALUES (101, 'Clinic 101') ON CONFLICT (id) DO NOTHING;
            INSERT INTO public."User" (id, "userId", "firstName", "lastName", gender, dob, "civilStatus", "bloodType", mobile, email, "isActive")
            VALUES (6001, 'auth0|eq_6001', 'Synth', 'EqualPatient', 'MALE', '1995-04-12', 'SINGLE', 'O_POSITIVE', '09170006001', 'eq6001@example.test', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (6501, 101, 6001);
            INSERT INTO public."UserAddress" (id, "userId", "addressLine", barangay, city, state, region, "zipCode", country, "isPrimary")
            VALUES (61, 6001, '100 Equal St', 'Brgy Equal', 'Cagayan de Oro', 'Misamis Oriental', 'Region X', '9000', 'Philippines', true);
            """);

        var pid6001 = DeterministicUuid.PatientAccountId(6001);
        var addr61Id = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, "v1_addr:61");

        // Pre-seed un-hashed patients & patient_addresses rows with fields IDENTICAL to v1
        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, $"""
            INSERT INTO public.patients (
                id, client_id, clinic_ez_id, first_name, last_name, sex, date_of_birth,
                civil_status, blood_type, mobile, email, consent_to_share_info, created_by
            ) VALUES (
                '{pid6001}', '{pid6001}', '{DeterministicUuid.GenerateClinicEzId(6001)}', 'Synth', 'EqualPatient', 'Male', '1995-04-12',
                'Single', 'O+', '09170006001', 'eq6001@example.test', true, 'seed'
            );
            INSERT INTO public.patient_addresses (
                id, client_id, patient_id, type, house_street, street_address, barangay,
                city_municipality, province, region, zip_code, country, is_primary, created_by
            ) VALUES (
                '{addr61Id}', '{addr61Id}', '{pid6001}', 'Home', '100 Equal St', '100 Equal St', 'Brgy Equal',
                'Cagayan de Oro', 'Misamis Oriental', 'Region X', '9000', 'Philippines', true, 'seed'
            );
            """);

        // ForceSyncEntityAsync on un-hashed equal PatientAddress MUST succeed with Updated == 1!
        var addrRun = await fx.Track2.ForceSyncEntityAsync(binding, "PatientAddress", "61", addr61Id, "test-t12-addr", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, addrRun.Status);
        var addrSum = JsonSerializer.Deserialize<SyncRunSummary>(addrRun.Summary.GetRawText(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        Assert.Equal(1, addrSum.For("PatientAddress").Updated);

        var addrMap = await fx.Ledger.GetIdMappingsByV1IdsAsync(binding.Id, "PatientAddress", new[] { "61" });
        Assert.Equal(addr61Id, addrMap["61"]);
        var addrHashes = await fx.Ledger.LoadRowHashesForIdsAsync(binding.Id, "PatientAddress", new[] { "61" });
        Assert.True(addrHashes.ContainsKey("61"));

        // ForceSyncEntityAsync on un-hashed equal PatientAccount MUST also succeed with Updated == 1!
        var acctRun = await fx.Track2.ForceSyncEntityAsync(binding, "PatientAccount", "6001", pid6001, "test-t12-acct", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, acctRun.Status);
        var acctSum = JsonSerializer.Deserialize<SyncRunSummary>(acctRun.Summary.GetRawText(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        Assert.Equal(1, acctSum.For("PatientAccount").Updated);

        var acctMap = await fx.Ledger.GetIdMappingsByV1IdsAsync(binding.Id, "PatientAccount", new[] { "6001" });
        Assert.Equal(pid6001, acctMap["6001"]);
    }

    [Fact]
    public async Task T13_CdcMvccOutOfOrderCommitGap_NeverSkipsInFlightLowerSeqTransaction()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 MVCC Out-of-Order Commit Gap T13");

        await SeedComprehensiveV1ClinicAndPatientDataAsync(fx.V1ConnectionString);

        var initRun = await fx.Coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.Backfill, null, false, "test-t13-init", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, initRun.Status);

        var initialCursor = await fx.Ledger.GetCursorAsync(binding.Id);
        Assert.True(initialCursor > 0);

        // Tx A opens and updates User 2001, allocating a lower BIGSERIAL seq while staying uncommitted.
        await using var connA = new NpgsqlConnection(fx.V1ConnectionString);
        await connA.OpenAsync();
        await using var txA = await connA.BeginTransactionAsync();
        await using (var cmdA = new NpgsqlCommand(
            """UPDATE public."User" SET "firstName" = 'MvccGapTxA' WHERE id = 2001;""", connA, txA))
        {
            await cmdA.ExecuteNonQueryAsync();
        }

        // Tx B opens on a second connection, updates User 2002 (allocating a higher BIGSERIAL seq), and commits immediately.
        await using (var connB = new NpgsqlConnection(fx.V1ConnectionString))
        {
            await connB.OpenAsync();
            await using var cmdB = new NpgsqlCommand(
                """UPDATE public."User" SET "firstName" = 'MvccGapTxB' WHERE id = 2002;""", connB);
            await cmdB.ExecuteNonQueryAsync();
        }

        // While Tx A is STILL uncommitted, incremental CDC MUST NOT leapfrog past Tx A's lower uncommitted seq.
        var midRun = await fx.Coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.Incremental, null, false, "test-t13-mid", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, midRun.Status);

        var midCursor = await fx.Ledger.GetCursorAsync(binding.Id);
        Assert.Equal(initialCursor, midCursor);

        // Now Tx A commits! Next incremental pull MUST pick up BOTH Tx A and Tx B with zero missed events.
        await txA.CommitAsync();

        var finalRun = await fx.Coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.Incremental, null, false, "test-t13-final", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, finalRun.Status);

        await using var v2 = new NpgsqlConnection(fx.PatientConnectionString);
        await v2.OpenAsync();
        Assert.Equal("MvccGapTxA", await ScalarStringAsync(v2, $"""SELECT first_name FROM public.patients WHERE id = '{DeterministicUuid.PatientAccountId(2001)}' """));
        Assert.Equal("MvccGapTxB", await ScalarStringAsync(v2, $"""SELECT first_name FROM public.patients WHERE id = '{DeterministicUuid.PatientAccountId(2002)}' """));

        var parity = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.Equal(0L, parity.ChangelogLag);
        Assert.True(await fx.Ledger.GetCursorAsync(binding.Id) >= initialCursor + 2);
    }

    [Fact]
    public async Task T14_CdcChangelogUninstallAndIdempotentReinstall_AutomaticallyResetsCursorAndResumesSync()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 Cursor Reset Recovery T14");

        await SeedComprehensiveV1ClinicAndPatientDataAsync(fx.V1ConnectionString);

        var initRun = await fx.Coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.Backfill, null, false, "test-t14-init", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, initRun.Status);

        // Generate a couple of CDC events so sync_cursors advances past seq #2
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."User" SET "firstName" = 'PreResetOne' WHERE id = 2001;
            UPDATE public."User" SET "firstName" = 'PreResetTwo' WHERE id = 2002;
            """);
        var preResetRun = await fx.Coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.Incremental, null, false, "test-t14-pre", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, preResetRun.Status);

        var highCursor = await fx.Ledger.GetCursorAsync(binding.Id);
        Assert.True(highCursor >= 2);

        // Uninstall tracking cleanly, then re-install twice (idempotency check) -> BIGSERIAL restarts at 1
        var uninstallSql = await System.IO.File.ReadAllTextAsync(
            System.IO.Path.Combine(Pg17TestFixture.SqlDirectory, "02_uninstall_v1_sync_changelog.sql"));
        var installSql = await System.IO.File.ReadAllTextAsync(
            System.IO.Path.Combine(Pg17TestFixture.SqlDirectory, "01_install_v1_sync_changelog.sql"));

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, uninstallSql);
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, installSql);
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, installSql);

        // Trigger a single update at seq = 1 (strictly lower than highCursor in sync_cursors)
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."User" SET "firstName" = 'CursorResetOk' WHERE id = 2001;
            """);

        // Parity MUST surface ChangelogLag == 1 (never falsely clamped to 0!)
        var parityBefore = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.Equal(1L, parityBefore.ChangelogMaxSeq);
        Assert.Equal(1L, parityBefore.ChangelogLag);

        // Incremental CDC MUST automatically detect startSeq > rawMaxSeq, reset cursor, and sync 'CursorResetOk'
        var recoverRun = await fx.Coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.Incremental, null, false, "test-t14-recover", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, recoverRun.Status);

        await using var v2 = new NpgsqlConnection(fx.PatientConnectionString);
        await v2.OpenAsync();
        Assert.Equal("CursorResetOk", await ScalarStringAsync(v2, $"""SELECT first_name FROM public.patients WHERE id = '{DeterministicUuid.PatientAccountId(2001)}' """));

        Assert.Equal(1L, await fx.Ledger.GetCursorAsync(binding.Id));
        var parityAfter = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.Equal(0L, parityAfter.ChangelogLag);
    }

    [Fact]
    public async Task T15_IdleAutoSyncWorkerPoll_SkipsEmptySyncRunsRow_WhileManualPullAndNonEmptyAutoSyncPersistAndFilterByMode()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 Idle AutoSync & Mode Filter T15");

        await SeedComprehensiveV1ClinicAndPatientDataAsync(fx.V1ConnectionString);

        var previewRun = await fx.Coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.DryRun, 25, false, "admin@test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, previewRun.Status);

        var backfillRun = await fx.Coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.Backfill, null, false, "admin@test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, backfillRun.Status);

        var runsBeforeIdle = await fx.Ledger.ListRunsAsync(binding.Id, 20);
        Assert.Equal(2, runsBeforeIdle.Count);

        // Idle AutoSyncWorker poll (0 changelog changes) MUST NOT add an empty sync_runs row
        var idleAuto = await fx.Coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.Incremental, null, false, "AutoSyncWorker", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, idleAuto.Status);

        var runsAfterIdleAuto = await fx.Ledger.ListRunsAsync(binding.Id, 20);
        Assert.Equal(2, runsAfterIdleAuto.Count);
        var refreshedBinding = await fx.Ledger.GetBindingAsync(binding.Id);
        Assert.NotNull(refreshedBinding!.LastPolledAt);

        // Manual pull with 0 changes STILL persists a sync_runs row for operator feedback
        var manualZero = await fx.Coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.Incremental, null, false, "admin@test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, manualZero.Status);
        Assert.Equal(3, (await fx.Ledger.ListRunsAsync(binding.Id, 20)).Count);

        // Non-empty AutoSyncWorker poll (1 real change) MUST persist a sync_runs row
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."User" SET "firstName" = 'AutoSyncRealDelta' WHERE id = 2001;
            """);
        var activeAuto = await fx.Coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.Incremental, null, false, "AutoSyncWorker", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, activeAuto.Status);
        Assert.Equal(4, (await fx.Ledger.ListRunsAsync(binding.Id, 20)).Count);

        // Server-side mode filter cleanly slices Migrations, Live Sync, and Previews
        var migrationRuns = await fx.Ledger.ListRunsAsync(binding.Id, 20, CancellationToken.None, "BACKFILL,FINAL_SWEEP");
        Assert.Single(migrationRuns);
        Assert.Equal(SyncRunMode.Backfill, migrationRuns[0].Mode);

        var liveSyncRuns = await fx.Ledger.ListRunsAsync(binding.Id, 20, CancellationToken.None, "INCREMENTAL");
        Assert.Equal(2, liveSyncRuns.Count);
        Assert.All(liveSyncRuns, r => Assert.Equal(SyncRunMode.Incremental, r.Mode));

        var previewRuns = await fx.Ledger.ListRunsAsync(binding.Id, 20, CancellationToken.None, "DRY_RUN");
        Assert.Single(previewRuns);
        Assert.Equal(SyncRunMode.DryRun, previewRuns[0].Mode);
    }

    [Fact]
    public async Task T16_ModernPatientImmunizationSchema_WithoutLegacyUserVaccination_SyncsSelfImmunizationsAndReconcilesParity()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 Modern PatientImmunization T16");

        await SeedComprehensiveV1ClinicAndPatientDataAsync(fx.V1ConnectionString);

        // Reproduce modern Neon development V1 schema where Prisma migration 20260626175645_add_vaccine_philhealth_data
        // replaced legacy UserVaccination / Vaccine / Dose / Route with PatientImmunization + PhilHealthImmunizationLibrary
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            DROP TABLE IF EXISTS public."UserVaccination" CASCADE;
            DROP TABLE IF EXISTS public."Vaccine" CASCADE;
            DROP TABLE IF EXISTS public."Dose" CASCADE;
            DROP TABLE IF EXISTS public."Route" CASCADE;

            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImmunizationCategory') THEN
                    CREATE TYPE public."ImmunizationCategory" AS ENUM ('CHILD', 'YOUNG_WOMAN', 'PREGNANT', 'ELDERLY', 'OTHER');
                END IF;
            END $$;

            CREATE TABLE public."PhilHealthImmunizationLibrary" (
                id SERIAL PRIMARY KEY,
                category public."ImmunizationCategory" NOT NULL DEFAULT 'OTHER',
                code TEXT NOT NULL,
                name TEXT NOT NULL,
                "defaultDoseLabel" TEXT,
                "defaultRoute" TEXT,
                "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
                "sortOrder" INT NOT NULL DEFAULT 0,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
            );

            CREATE TABLE public."PatientImmunization" (
                id SERIAL PRIMARY KEY,
                "userId" INT NOT NULL,
                "immunizationLibId" INT REFERENCES public."PhilHealthImmunizationLibrary"(id),
                category public."ImmunizationCategory" NOT NULL DEFAULT 'OTHER',
                code TEXT,
                "vaccineName" TEXT NOT NULL,
                "doseNumber" TEXT,
                route TEXT,
                "dateGiven" TIMESTAMP,
                "administeredBy" TEXT,
                "facilityName" TEXT,
                "lotNumber" TEXT,
                "expirationDate" TIMESTAMP,
                notes TEXT,
                "reportStatus" TEXT,
                "deficiencyRemarks" TEXT,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "deletedAt" TIMESTAMP,
                "isActive" BOOLEAN NOT NULL DEFAULT TRUE
            );

            INSERT INTO public."PhilHealthImmunizationLibrary" (id, category, code, name, "defaultDoseLabel", "defaultRoute")
            VALUES (10, 'ELDERLY', 'PNEUMO-23', 'Pneumococcal Polysaccharide', 'Dose 1', 'IM');

            INSERT INTO public."PatientImmunization" (id, "userId", "immunizationLibId", category, "vaccineName", "doseNumber", route, "dateGiven", "administeredBy", notes)
            VALUES
                (501, 2001, NULL, 'CHILD', 'BCG Vaccine', 'Birth Dose', 'ID', '2025-03-01 08:00:00', 'Nurse Maria', 'Left deltoid'),
                (502, 2001, 10, 'ELDERLY', '', NULL, NULL, '2025-04-10 09:00:00', 'Dr. Santos', 'Library fallback');
            """);

        var dryRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.DryRun, null, false, "test-t16", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, dryRun.Status);

        var backfill = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t16", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, backfill.Status);

        await using var v2 = new NpgsqlConnection(fx.PatientConnectionString);
        await v2.OpenAsync();
        Assert.Equal(2L, await ScalarInt64Async(v2, "SELECT COUNT(*) FROM public.patient_immunizations_self WHERE is_deleted = false"));
        Assert.Equal(0L, await ScalarInt64Async(v2, "SELECT COUNT(*) FROM public.vaccinations_administered WHERE is_deleted = false"));
        Assert.Equal("Child", await ScalarStringAsync(v2, "SELECT immunization_category FROM public.patient_immunizations_self WHERE vaccine_name = 'BCG Vaccine'"));
        Assert.Equal("Elderly", await ScalarStringAsync(v2, "SELECT immunization_category FROM public.patient_immunizations_self WHERE vaccine_name = 'Pneumococcal Polysaccharide'"));
        Assert.Equal("Dose 1", await ScalarStringAsync(v2, "SELECT dose_number FROM public.patient_immunizations_self WHERE vaccine_name = 'Pneumococcal Polysaccharide'"));

        var parity = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        var selfRow = Assert.Single(parity.Checks, e => e.EntityType == "PatientImmunizationsSelf");
        Assert.Equal(2L, selfRow.V1ExpectedCount);
        Assert.Equal(2L, selfRow.V2ActualCount);
        Assert.True(selfRow.IsMatched);

        // Also verify clean skip when neither UserVaccination nor PatientImmunization exists
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """DROP TABLE IF EXISTS public."PatientImmunization" CASCADE;""");
        var noTableDryRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.DryRun, null, false, "test-t16-none", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, noTableDryRun.Status);
    }

    [Fact]
    public async Task T17_FinalSweepAndIncremental_WithoutChangelogSchemaInstalled_CompleteCleanlyAndVerifyFullCohort()
    {
        await using var fx = await CreateInitializedTrack2FixtureAsync();
        var binding = await CreateScopedTrack2BindingAsync(fx, "Track2 FinalSweep Without Tracking T17");

        await SeedComprehensiveV1ClinicAndPatientDataAsync(fx.V1ConnectionString);

        var uninstallSql = await System.IO.File.ReadAllTextAsync(
            System.IO.Path.Combine(Pg17TestFixture.SqlDirectory, "02_uninstall_v1_sync_changelog.sql"));
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, uninstallSql);

        var backfill = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test-t17", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, backfill.Status);

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."User" SET "firstName" = 'Track2SweptClean' WHERE id = 2001;
            """);

        var sweep = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.FinalSweep, null, false, "test-t17", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, sweep.Status);

        await using var v2 = new NpgsqlConnection(fx.PatientConnectionString);
        await v2.OpenAsync();
        Assert.Equal("Track2SweptClean", await ScalarStringAsync(v2, $"""SELECT first_name FROM public.patients WHERE id = '{DeterministicUuid.PatientAccountId(2001)}'"""));

        var incManual = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Incremental, null, false, "admin@test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, incManual.Status);
    }

    // -------------------------------------------------------------------------
    // Helpers: Isolated Test Schema Provisioning (Exact 26-table PatientDb + V1)
    // -------------------------------------------------------------------------
    private static async Task<Pg17TestFixture> CreateInitializedTrack2FixtureAsync()
    {
        var fx = new Pg17TestFixture();
        await fx.InitializeAsync();
        await ExtendV1SchemaForTrack2Async(fx.V1ConnectionString);
        await ExtendPatientDbSchemaForTrack2Async(fx.PatientConnectionString);
        return fx;
    }

    private static Task<SyncBinding> CreateScopedTrack2BindingAsync(Pg17TestFixture fx, string name) =>
        fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track2Patient,
            Name: name,
            V1ClinicId: V1ClinicId,
            V1OrgId: V1OrgId,
            V2TenantId: V2TenantId,
            V2ClinicId: V2ClinicId,
            PatientCohortMode: SyncCohortMode.Scoped), "test-admin");

    private static Task<SyncBinding> CreateGlobalTrack2BindingAsync(Pg17TestFixture fx, string name) =>
        fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track2Patient,
            Name: name,
            V1ClinicId: V1ClinicId,
            V1OrgId: V1OrgId,
            V2TenantId: V2TenantId,
            V2ClinicId: V2ClinicId,
            PatientCohortMode: SyncCohortMode.Global), "test-admin");

    private static async Task ExtendV1SchemaForTrack2Async(string v1ConnString)
    {
        await Pg17TestFixture.ExecuteSqlAsync(v1ConnString, """
            CREATE TABLE IF NOT EXISTS public."Clinic" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."HealthcareProvider" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."HPProfile" (id SERIAL PRIMARY KEY, "healthcareProviderId" INT NOT NULL, title TEXT, name TEXT, suffix TEXT);
            CREATE TABLE IF NOT EXISTS public."ProfessionalDetails" (id SERIAL PRIMARY KEY, "healthcareProverId" INT NOT NULL, "licenseNumber" TEXT, "ptrNumber" TEXT);
            CREATE TABLE IF NOT EXISTS public."Service" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."FileType" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."Allergen" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."HealthCondition" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."Disability" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."Vaccine" (id SERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'OTHER');
            CREATE TABLE IF NOT EXISTS public."Dose" (id SERIAL PRIMARY KEY, dose TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."Route" (id SERIAL PRIMARY KEY, route TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."Drug" (id SERIAL PRIMARY KEY, "genericName" TEXT, "brandName" TEXT);
            CREATE TABLE IF NOT EXISTS public."System" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);

            ALTER TABLE public."UserAddress"
                ADD COLUMN IF NOT EXISTS "zipCode" TEXT,
                ADD COLUMN IF NOT EXISTS country TEXT,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();

            ALTER TABLE public."UserEmergencyContact"
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();

            CREATE TABLE IF NOT EXISTS public."UserAllergy" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "allergenId" INT, reaction TEXT, notes TEXT);
            CREATE TABLE IF NOT EXISTS public."UserHealthCondition" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "healthConditionId" INT, "dateDiagnosed" TIMESTAMPTZ, status TEXT, notes TEXT);
            CREATE TABLE IF NOT EXISTS public."MedicalHistory" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "conditionId" INT, details TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
            CREATE TABLE IF NOT EXISTS public."FamilyMedicalHistory" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "conditionId" INT, details TEXT, "deletedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
            CREATE TABLE IF NOT EXISTS public."PersonalHistory" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "smokingStatus" TEXT, "numberOfPacksPerYear" INT, "alcoholStatus" TEXT, "numberOfBottlesPerDay" INT, "illicitDrugUse" TEXT, "sexuallyActive" TEXT, "deletedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
            CREATE TABLE IF NOT EXISTS public."ObGyneHistory" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, gravidity INT, parity INT, abortion INT, "livingChildren" INT, "lastMenstrualPeriod" DATE, menarche INT, "menstrualCycleInterval" INT, "deletedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
            CREATE TABLE IF NOT EXISTS public."SurgicalHistory" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "operationName" TEXT NOT NULL, "operationDate" DATE, notes TEXT, "deletedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
            CREATE TABLE IF NOT EXISTS public."UserDisability" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "disabilityId" INT, severity TEXT, reason TEXT, notes TEXT);
            CREATE TABLE IF NOT EXISTS public."UserVaccination" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "vaccineId" INT, "doseId" INT, "routeId" INT, "dateGiven" TIMESTAMPTZ, "hpId" INT, "administeredBy" TEXT, notes TEXT, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "deletedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());

            ALTER TABLE public."PhilHealthRecord"
                ADD COLUMN IF NOT EXISTS "memberType" TEXT,
                ADD COLUMN IF NOT EXISTS "principalMemberPin" TEXT,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now();

            ALTER TABLE public."ClinicPatient"
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();

            ALTER TABLE public."Folder"
                ADD COLUMN IF NOT EXISTS name TEXT,
                ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
            ALTER TABLE public."File"
                ADD COLUMN IF NOT EXISTS "fileTypeId" INT,
                ADD COLUMN IF NOT EXISTS name TEXT,
                ADD COLUMN IF NOT EXISTS size BIGINT,
                ADD COLUMN IF NOT EXISTS url TEXT,
                ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
                ADD COLUMN IF NOT EXISTS "dateTaken" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."FileSetting"
                ADD COLUMN IF NOT EXISTS privacy TEXT,
                ADD COLUMN IF NOT EXISTS "scopeClinicId" INT;

            ALTER TABLE public."Appointment"
                ADD COLUMN IF NOT EXISTS subject TEXT,
                ADD COLUMN IF NOT EXISTS complaint TEXT,
                ADD COLUMN IF NOT EXISTS "caseNumber" TEXT,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            CREATE TABLE IF NOT EXISTS public."AppointmentAttribute" (
                id SERIAL PRIMARY KEY, "appointmentId" INT NOT NULL, date DATE, "timeStart" TEXT, "maxDuration" INT NOT NULL DEFAULT 15,
                status TEXT, "serviceId" INT, "preferredAppointee" INT, "receivedAt" TIMESTAMPTZ
            );
            ALTER TABLE public."AppointmentRouting" ADD COLUMN IF NOT EXISTS status TEXT, ADD COLUMN IF NOT EXISTS "routedTo" INT;
            ALTER TABLE public."AppointmentTag" ADD COLUMN IF NOT EXISTS "healthcareProviderId" INT;

            ALTER TABLE public."ConsultationTicket"
                ADD COLUMN IF NOT EXISTS subject TEXT,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            CREATE TABLE IF NOT EXISTS public."ConsultationTicketHP" (id SERIAL PRIMARY KEY, "consultationTicketId" INT NOT NULL, "hpId" INT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."ConsultationNote" (id SERIAL PRIMARY KEY, "consultationTicketId" INT NOT NULL, section TEXT NOT NULL, content TEXT NOT NULL);
            ALTER TABLE public."ConsultationDiagnosis"
                ADD COLUMN IF NOT EXISTS "icd10Code" TEXT,
                ADD COLUMN IF NOT EXISTS description TEXT,
                ADD COLUMN IF NOT EXISTS type TEXT;

            CREATE TABLE IF NOT EXISTS public."VitalSign" (
                id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "consultationTicketId" INT, "dateTaken" TIMESTAMPTZ,
                height NUMERIC(12,4), weight NUMERIC(12,4), bmi NUMERIC(14,4), "bpSystolic" INT, "bpDiastolic" INT,
                "pulseRate" INT, temp NUMERIC(12,4), spo2 NUMERIC(12,4), "respRate" INT, notes TEXT,
                "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "deletedAt" TIMESTAMPTZ,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            ALTER TABLE public."Prescription"
                ADD COLUMN IF NOT EXISTS "hpId" INT,
                ADD COLUMN IF NOT EXISTS "serialNumber" TEXT,
                ADD COLUMN IF NOT EXISTS remarks TEXT,
                ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."Medicine"
                ADD COLUMN IF NOT EXISTS name TEXT,
                ADD COLUMN IF NOT EXISTS "genericName" TEXT,
                ADD COLUMN IF NOT EXISTS "brandName" TEXT,
                ADD COLUMN IF NOT EXISTS dosage TEXT,
                ADD COLUMN IF NOT EXISTS frequency TEXT,
                ADD COLUMN IF NOT EXISTS unit TEXT,
                ADD COLUMN IF NOT EXISTS notes TEXT,
                ADD COLUMN IF NOT EXISTS duration INT,
                ADD COLUMN IF NOT EXISTS qty INT,
                ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."MedicineDispenseRecord" ADD COLUMN IF NOT EXISTS "isDispensed" BOOLEAN NOT NULL DEFAULT FALSE;
            CREATE TABLE IF NOT EXISTS public."MedicinePhilHealthData" (id SERIAL PRIMARY KEY, "medicineId" INT NOT NULL, "drugCode" TEXT);

            ALTER TABLE public."Medication"
                ADD COLUMN IF NOT EXISTS "hpId" INT,
                ADD COLUMN IF NOT EXISTS name TEXT,
                ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."MedicationDrug"
                ADD COLUMN IF NOT EXISTS "drugId" INT,
                ADD COLUMN IF NOT EXISTS dosage TEXT,
                ADD COLUMN IF NOT EXISTS frequency TEXT,
                ADD COLUMN IF NOT EXISTS unit TEXT,
                ADD COLUMN IF NOT EXISTS notes TEXT,
                ADD COLUMN IF NOT EXISTS duration INT;

            CREATE TABLE IF NOT EXISTS public."MedicalCertificateReason" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."ClinicMedicalCertificate" (
                id SERIAL PRIMARY KEY, "clinicId" INT NOT NULL, "clinicPatientId" INT NOT NULL, "consultationTicketId" INT, "hpId" INT,
                "serialNumber" TEXT, "reasonId" INT, impression TEXT, remarks TEXT,
                "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "deletedAt" TIMESTAMPTZ,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS public."ClinicLaboratoryProcedure" (id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT, "rvsCode" TEXT);
            ALTER TABLE public."ClinicLaboratoryRequest"
                ADD COLUMN IF NOT EXISTS "consultationTicketId" INT,
                ADD COLUMN IF NOT EXISTS "hpId" INT,
                ADD COLUMN IF NOT EXISTS "serialNumber" TEXT,
                ADD COLUMN IF NOT EXISTS impression TEXT,
                ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."ClinicLaboratoryRequestProcedure" ADD COLUMN IF NOT EXISTS "clinicLaboratoryProcedureId" INT;

            CREATE TABLE IF NOT EXISTS public."ClinicImagingProcedure" (id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT, "rvsCode" TEXT);
            ALTER TABLE public."ClinicImagingRequest"
                ADD COLUMN IF NOT EXISTS "consultationTicketId" INT,
                ADD COLUMN IF NOT EXISTS "hpId" INT,
                ADD COLUMN IF NOT EXISTS "serialNumber" TEXT,
                ADD COLUMN IF NOT EXISTS impression TEXT,
                ADD COLUMN IF NOT EXISTS reason TEXT,
                ADD COLUMN IF NOT EXISTS history TEXT,
                ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."ClinicImagingRequestProcedure" ADD COLUMN IF NOT EXISTS "clinicImagingProcedureId" INT;

            CREATE TABLE IF NOT EXISTS public."ClinicHeartStationProcedure" (id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT, "rvsCode" TEXT);
            ALTER TABLE public."ClinicHeartStationRequest"
                ADD COLUMN IF NOT EXISTS "consultationTicketId" INT,
                ADD COLUMN IF NOT EXISTS "hpId" INT,
                ADD COLUMN IF NOT EXISTS "serialNumber" TEXT,
                ADD COLUMN IF NOT EXISTS impression TEXT,
                ADD COLUMN IF NOT EXISTS reason TEXT,
                ADD COLUMN IF NOT EXISTS history TEXT,
                ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."ClinicHeartStationRequestProcedure" ADD COLUMN IF NOT EXISTS "clinicHeartStationProcedureId" INT;
            """);

        var cdcSql = await System.IO.File.ReadAllTextAsync(System.IO.Path.Combine(Pg17TestFixture.SqlDirectory, "01_install_v1_sync_changelog.sql"));
        await Pg17TestFixture.ExecuteSqlAsync(v1ConnString, cdcSql);
    }

    internal static async Task ExtendPatientDbSchemaForTrack2Async(string patientConnString)
    {
        // Exact 26-table CLINICEZ-PATIENT_DB schema (real widths, numeric scales, FKs, unique indexes, seeded document_types)
        await Pg17TestFixture.ExecuteSqlAsync(patientConnString, """
            ALTER TABLE public.patients
                ALTER COLUMN clerk_user_id TYPE VARCHAR(128),
                ALTER COLUMN clinic_ez_id TYPE VARCHAR(20),
                ALTER COLUMN sex TYPE VARCHAR(20),
                ALTER COLUMN civil_status TYPE VARCHAR(20),
                ALTER COLUMN blood_type TYPE VARCHAR(15);
            CREATE UNIQUE INDEX IF NOT EXISTS ix_patients_clerk_user_id ON public.patients (clerk_user_id) WHERE clerk_user_id IS NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS ix_patients_clinic_ez_id ON public.patients (clinic_ez_id);

            CREATE TABLE IF NOT EXISTS public.document_types (
                id UUID PRIMARY KEY,
                code VARCHAR(100) NOT NULL UNIQUE,
                label VARCHAR(200) NOT NULL,
                description VARCHAR(500),
                supported_extensions_json TEXT NOT NULL DEFAULT '[]',
                supported_mime_types_json TEXT NOT NULL DEFAULT '[]',
                native_preview_kind VARCHAR(50) NOT NULL DEFAULT 'pdf',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                sort_order INT NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                created_by TEXT NOT NULL DEFAULT 'system',
                updated_at TIMESTAMPTZ,
                updated_by TEXT,
                is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            INSERT INTO public.document_types (id, code, label, sort_order) VALUES
                ('11111111-1111-1111-1111-111111111111', 'xray', 'X-ray', 10),
                ('22222222-2222-2222-2222-222222222222', 'lab-result', 'Lab result', 20),
                ('33333333-3333-3333-3333-333333333333', 'medical-certificate', 'Medical certificate', 30),
                ('44444444-4444-4444-4444-444444444444', 'prescription', 'Prescription', 40),
                ('55555555-5555-5555-5555-555555555555', 'id', 'Government ID', 50),
                ('66666666-6666-6666-6666-666666666666', 'other', 'Other medical file', 999)
            ON CONFLICT (id) DO NOTHING;

            CREATE TABLE IF NOT EXISTS public.clinics (
                id UUID PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                tenant_id VARCHAR(100),
                is_workspace_eligible BOOLEAN NOT NULL DEFAULT FALSE,
                is_directory_published BOOLEAN NOT NULL DEFAULT FALSE,
                is_public BOOLEAN NOT NULL DEFAULT FALSE,
                supports_appointments BOOLEAN NOT NULL DEFAULT FALSE,
                is_gated BOOLEAN NOT NULL DEFAULT FALSE,
                specialties_json TEXT NOT NULL DEFAULT '[]',
                required_share_fields_json TEXT NOT NULL DEFAULT '[]',
                featured_score INT NOT NULL DEFAULT 0,
                active_member_count INT NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                is_platform_verified BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.patient_addresses (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                type VARCHAR(20) NOT NULL, house_street VARCHAR(200), barangay VARCHAR(100),
                city_municipality VARCHAR(100), province VARCHAR(100), region VARCHAR(100),
                zip_code VARCHAR(10), country VARCHAR(80), is_primary BOOLEAN NOT NULL DEFAULT FALSE,
                barangay_name VARCHAR(150), barangay_psgc VARCHAR(10),
                city_municipality_name VARCHAR(150), city_municipality_psgc VARCHAR(10),
                is_same_as_permanent BOOLEAN NOT NULL DEFAULT FALSE,
                province_name VARCHAR(150), province_psgc VARCHAR(10),
                region_name VARCHAR(150), region_psgc VARCHAR(10),
                street_address VARCHAR(300),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                deleted_at TIMESTAMPTZ, deleted_by TEXT
            );

            CREATE TABLE IF NOT EXISTS public.emergency_contacts (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                full_name VARCHAR(200) NOT NULL, relationship VARCHAR(80),
                mobile VARCHAR(20), alt_phone VARCHAR(20), is_primary BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                deleted_at TIMESTAMPTZ, deleted_by TEXT
            );

            CREATE TABLE IF NOT EXISTS public.patient_allergies (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                allergen_name VARCHAR(200) NOT NULL, allergy_type VARCHAR(30) NOT NULL,
                severity VARCHAR(30) NOT NULL, reaction VARCHAR(500), onset_date DATE, notes VARCHAR(1000),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.patient_chronic_conditions (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                condition_name VARCHAR(300) NOT NULL, diagnosed_at DATE,
                is_controlled BOOLEAN NOT NULL DEFAULT FALSE, treatment_notes VARCHAR(1000), current_medications VARCHAR(500),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.patient_past_illnesses (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                illness_name VARCHAR(300) NOT NULL, diagnosed_at DATE, resolved_at DATE,
                treatment_received VARCHAR(500), notes VARCHAR(1000),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.patient_family_histories (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                relation VARCHAR(30) NOT NULL, condition_name VARCHAR(300) NOT NULL,
                age_of_onset INT, is_deceased BOOLEAN NOT NULL DEFAULT FALSE, notes VARCHAR(1000),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.patient_social_histories (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                smoking_status VARCHAR(30), cigs_per_day INT, pack_years NUMERIC(5,1), quit_date DATE,
                other_tobacco_products VARCHAR(200), alcohol_use VARCHAR(30), alcohol_type VARCHAR(100),
                alcohol_frequency_days_per_week INT, alcohol_quantity_per_occasion INT,
                uses_substances BOOLEAN NOT NULL DEFAULT FALSE, substance_name VARCHAR(200),
                substance_route VARCHAR(100), substance_frequency VARCHAR(100),
                activity_level VARCHAR(30), exercise_type VARCHAR(200), exercise_frequency_days_per_week INT,
                diet_pattern VARCHAR(200), food_restrictions VARCHAR(500), sleep_avg_hours NUMERIC(4,1),
                sleep_quality VARCHAR(20), is_sexually_active BOOLEAN, water_intake VARCHAR(100), occupational_hazards VARCHAR(500),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ix_patient_social_histories_patient_id ON public.patient_social_histories (patient_id);

            CREATE TABLE IF NOT EXISTS public.patient_obstetric_profiles (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                gravida INT, para INT, abortus_count INT, living_children INT,
                last_menstrual_period DATE, menarche DATE, is_pregnant BOOLEAN NOT NULL DEFAULT FALSE,
                menstrual_cycle_length_days INT, has_dysmenorrhea BOOLEAN NOT NULL DEFAULT FALSE, notes VARCHAR(1000),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ix_patient_obstetric_profiles_patient_id ON public.patient_obstetric_profiles (patient_id);

            CREATE TABLE IF NOT EXISTS public.patient_surgical_histories (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                procedure_name VARCHAR(300) NOT NULL, surgeon_name VARCHAR(200), hospital VARCHAR(200),
                surgery_date DATE, anesthesia_type VARCHAR(80), complications VARCHAR(1000), notes VARCHAR(1000),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.patient_disabilities (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                body_part VARCHAR(100), classification VARCHAR(200), is_pwd_certified BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.patient_immunizations_self (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                immunization_category VARCHAR(30), vaccine_name VARCHAR(200) NOT NULL,
                dose_number VARCHAR(20), lot_number VARCHAR(50), date DATE, administered_by VARCHAR(200),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.patient_medications (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                medication_name VARCHAR(200) NOT NULL, generic_name VARCHAR(200), dosage VARCHAR(100),
                frequency VARCHAR(100), route VARCHAR(80), start_date DATE, end_date DATE,
                is_currently_taking BOOLEAN NOT NULL DEFAULT TRUE, prescribed_by VARCHAR(200),
                purpose VARCHAR(500), notes VARCHAR(1000),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.patient_government_ids (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                id_type VARCHAR(30) NOT NULL, id_number VARCHAR(100) NOT NULL,
                issued_at DATE, expires_at DATE, philhealth_category TEXT,
                sponsor_pin VARCHAR(50), sponsor_last_name VARCHAR(100), sponsor_first_name VARCHAR(100),
                sponsor_middle_name VARCHAR(100), sponsor_suffix VARCHAR(20), sponsor_dob DATE, sponsor_relationship VARCHAR(50),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.file_records (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                clinic_id UUID, file_name VARCHAR(255) NOT NULL, mime_type VARCHAR(100), extension VARCHAR(20),
                size_bytes BIGINT NOT NULL, storage_key VARCHAR(500) NOT NULL,
                document_type_id UUID NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
                sync_status VARCHAR(20) NOT NULL, sync_error VARCHAR(500), uploaded_at TIMESTAMPTZ NOT NULL,
                encryption_algorithm VARCHAR(50), encryption_key_id VARCHAR(100), encryption_iv_base64 VARCHAR(100),
                encryption_tag_base64 VARCHAR(100), encrypted_size_bytes BIGINT, encrypted_hash VARCHAR(200),
                wrapped_key_json TEXT, document_date DATE, facility_name VARCHAR(200), notes VARCHAR(1000),
                title VARCHAR(200) NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.clinic_memberships (
                id UUID PRIMARY KEY, client_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
                status VARCHAR(20) NOT NULL, consent_privacy_policy BOOLEAN NOT NULL,
                consent_terms_and_conditions BOOLEAN NOT NULL, consent_data_sharing BOOLEAN NOT NULL,
                consented_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ix_clinic_memberships_patient_id_clinic_id ON public.clinic_memberships (patient_id, clinic_id);

            CREATE TABLE IF NOT EXISTS public.appointments (
                id UUID PRIMARY KEY,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                clinic_id UUID NOT NULL, provider_id UUID NOT NULL,
                subject TEXT, chief_complaint TEXT, notes VARCHAR(1000),
                attached_file_ids_json TEXT NOT NULL, service_type VARCHAR(200),
                scheduled_at TIMESTAMPTZ NOT NULL, duration_minutes INT NOT NULL,
                status VARCHAR(30) NOT NULL, cached_at TIMESTAMPTZ NOT NULL, raw_json TEXT NOT NULL,
                checked_in_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.consultations (
                id UUID PRIMARY KEY,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                clinic_id UUID NOT NULL, provider_id UUID NOT NULL,
                consulted_at TIMESTAMPTZ NOT NULL, chief_complaint VARCHAR(500),
                assessment VARCHAR(2000), diagnosis VARCHAR(500), icd10code VARCHAR(20),
                plan VARCHAR(2000), notes VARCHAR(2000),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.vital_signs (
                id UUID PRIMARY KEY,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                clinic_id UUID NOT NULL,
                consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
                recorded_at TIMESTAMPTZ NOT NULL,
                weight_kg NUMERIC(5,2), height_cm NUMERIC(5,1), bmi NUMERIC(5,2),
                systolic_bp INT, diastolic_bp INT, heart_rate_bpm INT,
                temperature_celsius NUMERIC(4,1), oxygen_saturation_percent NUMERIC(4,1),
                respiratory_rate_breaths_per_min INT, deep_sleep_minutes INT,
                fasting_blood_glucose_mg_dl NUMERIC(6,1), sleep_duration_minutes INT,
                source VARCHAR(40),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.prescription_documents (
                id UUID PRIMARY KEY,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                prescription_id UUID NOT NULL, prescription_number VARCHAR(60) NOT NULL,
                ordering_tenant_id VARCHAR(100) NOT NULL, ordering_facility_id VARCHAR(64) NOT NULL,
                ordering_facility_name VARCHAR(200) NOT NULL, prescriber_name VARCHAR(200) NOT NULL,
                prescriber_prc_license VARCHAR(50) NOT NULL, diagnosis VARCHAR(500), instructions VARCHAR(1000),
                stage VARCHAR(30) NOT NULL, stage_changed_at TIMESTAMPTZ, quoted_amount NUMERIC(12,2),
                pharmacy_name VARCHAR(200), claim_token VARCHAR(2000), verification_url VARCHAR(500),
                receipt_number VARCHAR(100), dispensed_at TIMESTAMPTZ, external_pharmacy_name VARCHAR(200),
                issued_at TIMESTAMPTZ NOT NULL, has_details BOOLEAN NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                deleted_by VARCHAR(128)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ix_prescription_documents_patient_id_prescription_id ON public.prescription_documents (patient_id, prescription_id);

            CREATE TABLE IF NOT EXISTS public.prescriptions (
                id UUID PRIMARY KEY,
                consultation_id UUID REFERENCES public.consultations(id) ON DELETE CASCADE,
                prescription_document_id UUID REFERENCES public.prescription_documents(id) ON DELETE CASCADE,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
                clinic_id UUID NOT NULL, medication_name VARCHAR(200) NOT NULL,
                generic_name VARCHAR(200), brand_name VARCHAR(200), form VARCHAR(50),
                sort_order INT NOT NULL, dosage VARCHAR(100), frequency VARCHAR(100),
                duration VARCHAR(100), instructions VARCHAR(500), quantity INT,
                issued_at TIMESTAMPTZ NOT NULL, is_dispensed BOOLEAN NOT NULL,
                is_phil_health_gamot BOOLEAN NOT NULL, phil_health_drug_code TEXT,
                unique_prescription_security_code TEXT, gamot_coverage_amount NUMERIC,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.medical_certificates (
                id UUID PRIMARY KEY,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                certificate_id UUID NOT NULL, certificate_number VARCHAR(60) NOT NULL,
                issuer_tenant_id VARCHAR(100) NOT NULL, issuer_facility_id VARCHAR(64) NOT NULL,
                issuer_name VARCHAR(200) NOT NULL, doctor_name VARCHAR(200) NOT NULL,
                doctor_prc_license VARCHAR(50) NOT NULL, doctor_ptr_number VARCHAR(50),
                purpose VARCHAR(300) NOT NULL, diagnosis VARCHAR(500), remarks VARCHAR(1000),
                rest_days INT, valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ,
                issued_at TIMESTAMPTZ NOT NULL, verification_token VARCHAR(200), verification_url VARCHAR(500),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                deleted_by VARCHAR(128)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ix_medical_certificates_patient_id_certificate_id ON public.medical_certificates (patient_id, certificate_id);

            CREATE TABLE IF NOT EXISTS public.lab_request_slips (
                id UUID PRIMARY KEY,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                requisition_id UUID NOT NULL, ordering_tenant_id VARCHAR(100) NOT NULL,
                ordering_facility_id VARCHAR(64) NOT NULL, ordering_facility_name VARCHAR(200) NOT NULL,
                accession_number VARCHAR(60) NOT NULL, title VARCHAR(300) NOT NULL,
                urgency VARCHAR(30) NOT NULL, items_json TEXT NOT NULL,
                stage VARCHAR(30) NOT NULL, stage_changed_at TIMESTAMPTZ,
                quoted_amount NUMERIC(12,2), currency VARCHAR(3), payment_required BOOLEAN NOT NULL,
                laboratory_name VARCHAR(200), reason VARCHAR(500), claim_token VARCHAR(2000),
                issued_at TIMESTAMPTZ NOT NULL, has_details BOOLEAN NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                deleted_by VARCHAR(128)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ix_lab_request_slips_patient_id_requisition_id ON public.lab_request_slips (patient_id, requisition_id);

            CREATE TABLE IF NOT EXISTS public.vaccinations_administered (
                id UUID PRIMARY KEY,
                patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
                clinic_id UUID, vaccine_name VARCHAR(200) NOT NULL, disease_targeted VARCHAR(200),
                dose_number VARCHAR(20), date_administered DATE NOT NULL, lot_batch_number VARCHAR(50),
                administered_by VARCHAR(200), facility VARCHAR(200), route VARCHAR(50),
                injection_site VARCHAR(100), next_due_date DATE, adverse_reaction VARCHAR(20),
                adverse_reaction_description VARCHAR(500), vaccine_program VARCHAR(30),
                synced_at TIMESTAMPTZ, server_id VARCHAR(128),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by VARCHAR(128) NOT NULL,
                updated_at TIMESTAMPTZ, updated_by VARCHAR(128), is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                deleted_by TEXT
            );
            """);
    }

    private static async Task SeedComprehensiveV1ClinicAndPatientDataAsync(string v1ConnString)
    {
        var longAssess = "Extended clinical assessment: " + new string('A', 620);
        await Pg17TestFixture.ExecuteSqlAsync(v1ConnString, $"""
            INSERT INTO public."Clinic" (id, name) VALUES (101, 'Clinic 101 Main') ON CONFLICT (id) DO NOTHING;
            INSERT INTO public."Service" (id, name) VALUES (1, 'Primary Care');
            INSERT INTO public."FileType" (id, name) VALUES (1, 'ECG'), (2, 'Laboratory');
            INSERT INTO public."Allergen" (id, name) VALUES (1, 'Penicillin');
            INSERT INTO public."HealthCondition" (id, name) VALUES (1, 'Hypertension'), (2, 'Measles'), (3, 'Diabetes');
            INSERT INTO public."Disability" (id, name) VALUES (1, 'Visual');
            INSERT INTO public."Vaccine" (id, name, type) VALUES (1, 'Tetanus Toxoid', 'PREGNANT'), (2, 'Hepatitis B', 'OTHER');
            INSERT INTO public."Dose" (id, dose) VALUES (1, 'Dose 1');
            INSERT INTO public."Route" (id, route) VALUES (1, 'Intramuscular');
            INSERT INTO public."Drug" (id, "genericName", "brandName") VALUES (1, 'Metformin', 'Glucophage');
            INSERT INTO public."MedicalCertificateReason" (id, name) VALUES (1, 'Fit to Work Clearance');
            INSERT INTO public."ClinicLaboratoryProcedure" (id, name, category, "rvsCode") VALUES (1, 'Complete Blood Count', 'Hematology', 'CBC-01');
            INSERT INTO public."ClinicImagingProcedure" (id, name, category, "rvsCode") VALUES (1, 'Chest X-Ray PA', 'Radiology', 'CXR-01');
            INSERT INTO public."ClinicHeartStationProcedure" (id, name, category, "rvsCode") VALUES (1, '12-Lead ECG', 'Cardiology', 'ECG-12');

            INSERT INTO public."User" (id, "userId", "firstName", "lastName", gender, dob, "civilStatus", "bloodType", mobile, email, "isActive")
            VALUES
                (2001, 'auth0|legacy_2001', 'Synth', 'PatientOne', 'MALE', '1995-04-12', 'SINGLE', 'O_POSITIVE', '09170002001', 'synth2001@example.test', true),
                (2002, 'user_clerk_2002', 'Synth', 'PatientTwo', 'FEMALE', '1998-07-20', 'MARRIED', 'A_POSITIVE', '09170002002', 'synth2002@example.test', true),
                (2003, 'auth0|doc_2003', 'Doctor', 'ClinicianOne', 'FEMALE', '1985-01-10', 'MARRIED', 'B_POSITIVE', '09170002003', 'doc2003@example.test', true);

            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES
                (501, 101, 2001),
                (502, 101, 2002);
            INSERT INTO public."OrganizationMember" (id, "organizationId", "userId") VALUES
                (601, 201, 2001),
                (602, 201, 2002);

            INSERT INTO public."HealthcareProvider" (id, "userId") VALUES (701, 2003);
            INSERT INTO public."HPProfile" (id, "healthcareProviderId", title, name, suffix) VALUES (1, 701, 'Dr.', 'ClinicianOne', 'MD');
            INSERT INTO public."ProfessionalDetails" (id, "healthcareProverId", "licenseNumber", "ptrNumber") VALUES (1, 701, 'PRC-998877', 'PTR-112233');

            INSERT INTO public."UserAddress" (id, "userId", "addressLine", barangay, city, state, region, "zipCode", country, "isPrimary")
            VALUES
                (1, 2001, '100 Primary St', 'Brgy 1', 'Cagayan de Oro', 'Misamis Oriental', 'Region X', '9000', 'Philippines', true),
                (2, 2002, '200 Secondary St', 'Brgy 2', 'Cagayan de Oro', 'Misamis Oriental', 'Region X', '9000', 'Philippines', true);
            INSERT INTO public."UserEmergencyContact" (id, "userId", "firstName", "lastName", relationship, phone, "isPrimary")
            VALUES (1, 2001, 'Guard', 'One', 'Parent', '09170009999', true);
            INSERT INTO public."UserAllergy" (id, "userId", "allergenId", reaction, notes) VALUES (1, 2001, 1, 'Rash', 'Avoid');
            INSERT INTO public."UserHealthCondition" (id, "userId", "healthConditionId", "dateDiagnosed", status, notes)
            VALUES (1, 2001, 1, '2024-01-01T00:00:00Z', 'ACTIVE', 'Monitor BP');
            INSERT INTO public."MedicalHistory" (id, "userId", "conditionId", details) VALUES (1, 2001, 2, 'Childhood');
            INSERT INTO public."FamilyMedicalHistory" (id, "userId", "conditionId", details) VALUES (1, 2001, 3, 'Parent history');
            INSERT INTO public."PersonalHistory" (id, "userId", "smokingStatus", "numberOfPacksPerYear", "alcoholStatus", "illicitDrugUse", "sexuallyActive")
            VALUES (1, 2001, 'CURRENT', 5, 'OCCASIONAL', 'NO', 'YES');
            INSERT INTO public."ObGyneHistory" (id, "userId", gravidity, parity, abortion, "livingChildren", menarche)
            VALUES (1, 2002, 2, 2, 0, 2, 13);
            INSERT INTO public."SurgicalHistory" (id, "userId", "operationName", "operationDate", notes)
            VALUES (1, 2001, 'Appendectomy', '2020-05-01', 'Recovered');
            INSERT INTO public."UserDisability" (id, "userId", "disabilityId", severity, reason)
            VALUES (1, 2001, 1, 'MODERATE', 'Myopia');
            INSERT INTO public."UserVaccination" (id, "userId", "vaccineId", "doseId", "routeId", "dateGiven", "hpId", "administeredBy")
            VALUES
                (1, 2001, 1, 1, 1, '2025-01-10T08:00:00Z', NULL, 'Self'),
                (2, 2001, 2, 1, 1, '2025-02-15T08:00:00Z', 701, 'Nurse A');
            INSERT INTO public."Medication" (id, "clinicId", "patientId", "hpId", name) VALUES (1, 101, 2001, 701, 'Metformin');
            INSERT INTO public."MedicationDrug" (id, "medicationId", "drugId", dosage, frequency, unit, notes, duration)
            VALUES (1, 1, 1, '500mg', 'Once daily', 'tablet', 'With meals', 30);
            INSERT INTO public."PhilHealthRecord" (id, "userId", pin, tin, "philSysId", "memberType", "principalMemberPin")
            VALUES (1, 2001, '12-345678901-2', '123-456-789', 'PSN-2001', 'D', '99-887766554-3');

            -- Active folder + PRIVATE file (MUST sync) vs deleted folder + active file (MUST exclude)
            INSERT INTO public."Folder" (id, "userId", name, "isActive", "deletedAt") VALUES
                (1, 2001, 'Active Folder', true, NULL),
                (2, 2001, 'Deleted Folder', false, now());
            INSERT INTO public."File" (id, "folderId", "fileTypeId", name, size, url, "mimeType", "dateTaken") VALUES
                (1, 1, 1, 'ecg-strip.pdf', 1024, 'https://storage.example.test/files/ecg-1.pdf', 'application/pdf', '2026-03-01T08:00:00Z'),
                (2, 2, 2, 'deleted-folder-file.pdf', 512, 'https://storage.example.test/files/del-2.pdf', 'application/pdf', '2026-03-01T08:00:00Z');
            INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId") VALUES (1, 1, 'PRIVATE', 101);

            -- Group B clinical records
            INSERT INTO public."Appointment" (id, "clinicId", subject, complaint, "caseNumber") VALUES (801, 101, 'Annual Check', 'Cough', 'CASE-801');
            INSERT INTO public."AppointmentRequester" (id, "appointmentId", "userId") VALUES (1, 801, 2001);
            INSERT INTO public."AppointmentAttribute" (id, "appointmentId", date, "timeStart", "maxDuration", status, "serviceId", "preferredAppointee", "receivedAt")
            VALUES (1, 801, '2026-03-01', '09:00', 30, 'COMPLETED', 1, 701, '2026-03-01T08:50:00Z');

            INSERT INTO public."ConsultationTicket" (id, "clinicId", "clinicPatientId", "appointmentId", subject, "isActive")
            VALUES (901, 101, 501, 801, 'Consult Subject', true);
            INSERT INTO public."ConsultationTicketHP" (id, "consultationTicketId", "hpId") VALUES (1, 901, 701);
            INSERT INTO public."ConsultationNote" (id, "consultationTicketId", section, content) VALUES
                (1, 901, 'assessment', '{longAssess}'),
                (2, 901, 'plan', 'Follow up in 1 week');
            INSERT INTO public."ConsultationDiagnosis" (id, "consultationTicketId", "icd10Code", description, type)
            VALUES (1, 901, 'I10', 'Essential Hypertension', 'PRIMARY');

            INSERT INTO public."VitalSign" (id, "userId", "consultationTicketId", "dateTaken", height, weight, bmi, "bpSystolic", "bpDiastolic", "pulseRate", temp, spo2, "respRate")
            VALUES (1, 2001, 901, '2026-03-01T09:10:00Z', 170.0, 68.5, 23.70, 120, 80, 72, 36.6, 98.0, 16);

            INSERT INTO public."Prescription" (id, "clinicId", "patientId", "consultationTicketId", "hpId", "serialNumber", remarks)
            VALUES (1, 101, 501, 901, 701, 'RX-001', 'Take after meals');
            INSERT INTO public."Medicine" (id, "prescriptionId", name, "genericName", "brandName", dosage, frequency, unit, notes, duration, qty)
            VALUES (1, 1, 'Paracetamol 500mg', 'Paracetamol', 'Biogesic', '500mg', 'q6h PRN', 'tablet', 'For fever', 5, 10);
            INSERT INTO public."MedicineDispenseRecord" (id, "medicineId", "isDispensed") VALUES (1, 1, true);
            INSERT INTO public."MedicinePhilHealthData" (id, "medicineId", "drugCode") VALUES (1, 1, 'PH-PARA');

            INSERT INTO public."ClinicMedicalCertificate" (id, "clinicId", "clinicPatientId", "consultationTicketId", "hpId", "serialNumber", "reasonId", impression, remarks)
            VALUES (1, 101, 501, 901, 701, 'MC-001', 1, 'Cleared', 'No restrictions');

            INSERT INTO public."ClinicLaboratoryRequest" (id, "clinicId", "clinicPatientId", "consultationTicketId", "hpId", "serialNumber", impression)
            VALUES (1, 101, 501, 901, 701, 'LAB-001', 'Baseline CBC');
            INSERT INTO public."ClinicLaboratoryRequestProcedure" (id, "clinicLaboratoryRequestId", "clinicLaboratoryProcedureId") VALUES (1, 1, 1);

            INSERT INTO public."ClinicImagingRequest" (id, "clinicId", "clinicPatientId", "consultationTicketId", "hpId", "serialNumber", impression, reason)
            VALUES (1, 101, 501, 901, 701, 'IMG-001', 'Clear', 'Screening CXR');
            INSERT INTO public."ClinicImagingRequestProcedure" (id, "clinicImagingRequestId", "clinicImagingProcedureId") VALUES (1, 1, 1);

            INSERT INTO public."ClinicHeartStationRequest" (id, "clinicId", "clinicPatientId", "consultationTicketId", "hpId", "serialNumber", impression, reason)
            VALUES (1, 101, 501, 901, 701, 'ECG-001', 'Normal sinus', 'Baseline ECG');
            INSERT INTO public."ClinicHeartStationRequestProcedure" (id, "clinicHeartStationRequestId", "clinicHeartStationProcedureId") VALUES (1, 1, 1);
            """);
    }

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
