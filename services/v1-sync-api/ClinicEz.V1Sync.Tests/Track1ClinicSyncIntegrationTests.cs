using System.Text.Json;
using ClinicEz.V1Sync.Api.Models;
using ClinicEz.V1Sync.Api.Services;
using Npgsql;
using Xunit;

namespace ClinicEz.V1Sync.Tests;

[Collection("Pg17Integration")]
public sealed class Track1ClinicSyncIntegrationTests
{
    private const string V2TenantId = "tnt-track1-test";
    private static readonly Guid V2ClinicId = Guid.Parse("11111111-2222-3333-4444-555555555555");
    private const int V1ClinicId = 101;
    private const int V1OrgId = 201;

    [Fact]
    public async Task Backfill_MapsAllEnumsMaxLengthsNumericSanitizersAndCustomFieldsAccurately()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding = await CreateClinicBindingAsync(fx, "Track1 Full Backfill Test");

        // Pre-seed broken & retired CustomFieldDefinitions with random UUIDs to verify in-place healing without unique-key collision
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $"""
            INSERT INTO public."CustomFieldDefinitions" ("Id","EntityType","FieldKey","Label","DataType","Category","IsRequired","DisplayOrder","IsActive","BoundaryMode","IsDeleted","TenantId","ClinicId")
            VALUES
                ('{Guid.NewGuid()}','Patient','emergency_contact_phone','Emergency Contact Phone','Phone','Emergency Contact',false,99,true,'Both',false,'{V2TenantId}','{V2ClinicId}'),
                ('{Guid.NewGuid()}','Patient','primary_address_line','Retired Primary Address','Text','Address',false,100,true,NULL,false,'{V2TenantId}','{V2ClinicId}'),
                ('{Guid.NewGuid()}','Patient','secondary_city_province','Retired City Province','Text','Address',false,101,true,NULL,false,'{V2TenantId}','{V2ClinicId}');
            """);

        // Seed rich v1 data covering all 24 synced entity types, extreme numeric values, long strings, and lookups
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."System" (id, name) VALUES (1, 'General Medicine'), (2, 'Pediatrics');
            INSERT INTO public."FileType" (id, name) VALUES (1, 'Electrocardiogram (ECG)'), (2, 'Laboratory Result');
            INSERT INTO public."AppointmentMode" (id, name) VALUES (1, 'Physical'), (2, 'Virtual');
            INSERT INTO public."AppointmentType" (id, name) VALUES (1, 'Follow-up Check');
            INSERT INTO public."Service" (id, name, "isActive", "deletedAt") VALUES (1, 'Primary Care', true, NULL);
            INSERT INTO public."Allergen" (id, name) VALUES (1, 'SuperLongAllergenName-' || repeat('X', 180));
            INSERT INTO public."HealthCondition" (id, name, code) VALUES (1, 'Essential Hypertension', 'I10'), (2, 'Diabetes Mellitus Type 2', 'E11');
            INSERT INTO public."Vaccine" (id, name) VALUES (1, 'Hepatitis B Vaccine ' || repeat('V', 160));
            INSERT INTO public."Dose" (id, dose) VALUES (1, 'First Dose');
            INSERT INTO public."Route" (id, route) VALUES (1, 'Intramuscular');
            INSERT INTO public."MedicalCertificateReason" (id, name) VALUES (1, 'Extended Pre-Employment Medical Clearance Evaluation Exceeding Fifty Characters');
            INSERT INTO public."MedicalCertificateFinding" (id, name) VALUES (1, 'Normal physical exam findings');
            INSERT INTO public."MedicalCertificateClassification" (id, name) VALUES (1, 'Fit with Restrictions');
            INSERT INTO public."ClinicLaboratoryProcedure" (id, name, category, "rvsCode") VALUES (1, 'Complete Blood Count', 'Hematology', 'CBC-RVS-CODE-LONG-99999999');
            INSERT INTO public."ClinicImagingProcedure" (id, name, category, "rvsCode") VALUES (1, 'Chest X-Ray PA', 'Radiology', 'CXR-01');
            INSERT INTO public."ClinicHeartStationProcedure" (id, name, category, "rvsCode") VALUES (1, '12-Lead ECG', 'Cardiology', 'ECG-12');
            INSERT INTO public."KonsultaManagementCode" (id, code, "sortOrder") VALUES (1, 'KMC-01', 1), (2, 'KMC-02', 2);
            INSERT INTO public."Drug" (id, "genericName", "brandName") VALUES (1, 'Metformin', 'Glucophage');
            INSERT INTO public."PhysicalExamLibrary" (id, category, code, description) VALUES
                ('gen-norm', 'General Survey', '1', 'Essentially Normal'),
                ('skin-abn', 'Skin', '2', 'Abnormal rash noted'),
                ('heent-norm', 'HEENT', '1', 'Normal findings');

            INSERT INTO public."OrganizationCollege" (id, "organizationId", name) VALUES (1, 201, 'College of Computing');
            INSERT INTO public."OrganizationProgram" (id, "organizationId", name) VALUES (1, 201, 'BS Information Technology');
            INSERT INTO public."OrganizationDepartment" (id, "organizationId", name) VALUES (1, 201, 'Clinic Operations');
            INSERT INTO public."OrganizationOffice" (id, "organizationId", name) VALUES (1, 201, 'Health Unit');
            INSERT INTO public."OrganizationYearLevel" (id, "organizationId", name) VALUES (1, 201, '3rd Year');
            INSERT INTO public."StudentLevel" (id, name) VALUES (1, 'College');

            INSERT INTO public."User" (id, "firstName", "lastName", "middleName", suffix, dob, gender, "civilStatus", "bloodType", mobile, telephone, email, nationality, religion, nickname, "placeOfBirth", "caseNumber", "accountType", "onboardingStatus", "verificationStatus", "isActive")
            VALUES
                (1001, 'Synth', 'PatientOne', 'M', 'Jr.', '1995-04-12', 'MALE', 'SINGLE', 'O_POSITIVE', '09170000001', '088-111-2222', 'synth.p01@example.test', 'Filipino', 'None', 'SP1', 'City A', 'CASE-1001', 'STUDENT', 'COMPLETED', 'VERIFIED', true),
                (1002, 'Doctor', 'ClinicianOne', NULL, NULL, '1985-02-01', 'FEMALE', 'MARRIED', 'A_POSITIVE', '09170000002', NULL, 'doc.c01@example.test', 'Filipino', NULL, NULL, NULL, NULL, 'EMPLOYEE', 'COMPLETED', 'VERIFIED', true);

            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (501, 101, 1001);
            INSERT INTO public."OrganizationMember" (id, "organizationId", "userId") VALUES (601, 201, 1001);
            INSERT INTO public."UserStudentRecord" (id, "userId", "organizationId", "studentId", lrn, level, "collegeId", "programId", "yearLevel")
            VALUES (1, 1001, 201, '2026-1001', 'LRN-1001', 1, 1, 1, 1);
            INSERT INTO public."UserEmploymentRecord" (id, "userId", "organizationId", "employeeId", "departmentId", "officeId", "collegeId", position, designation)
            VALUES (1, 1001, 201, 'EMP-1001', 1, 1, 1, 'Assistant', 'Lab Aide');

            INSERT INTO public."HealthcareProvider" (id, "userId") VALUES (701, 1002);
            INSERT INTO public."HPProfile" (id, "healthcareProviderId", title, name, suffix) VALUES (1, 701, 'Dr.', 'ClinicianOne', 'MD');
            INSERT INTO public."ProfessionalDetails" (id, "healthcareProverId", "licenseNumber", "ptrNumber") VALUES (1, 701, 'PRC-998877', 'PTR-112233');

            INSERT INTO public."UserAddress" (id, "userId", "addressLine", barangay, city, state, region, "zipCode", "isPrimary")
            VALUES
                (1, 1001, '100 Primary St', 'Brgy Alpha', 'Cagayan de Oro', 'Misamis Oriental', 'Region X', '9000-EXTRA-ZIP', true),
                (2, 1001, '200 Secondary Ave', 'Brgy Beta', 'Iligan', 'Lanao del Norte', 'Region X', '9200', false);

            INSERT INTO public."UserEmergencyContact" (id, "userId", "firstName", "lastName", phone, relationship, address, "isPrimary")
            VALUES (1, 1001, 'Guard', 'ContactOne', '+63-917-000-9999-EXTENSION-1234567', 'Guardian', '999 Emergency Rd', true);

            INSERT INTO public."UserAllergy" (id, "userId", "allergenId", reaction, notes) VALUES (1, 1001, 1, 'Hives', 'Avoid exposure');
            INSERT INTO public."UserHealthCondition" (id, "userId", "healthConditionId", status, severity, notes) VALUES (1, 1001, 1, 'ACTIVE', 'MODERATE', 'Monitor BP');
            INSERT INTO public."MedicalHistory" (id, "userId", "conditionId", details) VALUES (1, 1001, 2, 'Diet controlled');
            INSERT INTO public."FamilyMedicalHistory" (id, "userId", "conditionId", details) VALUES (1, 1001, 1, 'Parent history');
            INSERT INTO public."PersonalHistory" (id, "userId", "smokingStatus", "numberOfPacksPerYear", "alcoholStatus", "numberOfBottlesPerDay", "illicitDrugUse", "sexuallyActive")
            VALUES (1, 1001, 'YES', 3, 'EX', 0, 'NO', 'YES');
            INSERT INTO public."ObGyneHistory" (id, "userId", menarche, gravidity, parity, "typeOfDelivery")
            VALUES (1, 1001, 12, 1, 1, 'Normal Spontaneous Vaginal Delivery With Extended Description Beyond 50 Chars');
            INSERT INTO public."SurgicalHistory" (id, "userId", "operationName", "operationDate", notes)
            VALUES (1, 1001, 'Appendectomy', '2020-05-01', 'Uncomplicated');
            INSERT INTO public."UserVaccination" (id, "userId", "vaccineId", "doseId", "routeId", "dateGiven", "administeredBy", notes)
            VALUES (1, 1001, 1, 1, 1, '2025-01-15T08:00:00Z', 'Nurse A', 'Right deltoid');
            INSERT INTO public."PhilHealthRecord" (id, "userId", pin, tin, "philSysId", "memberType", "principalMemberPin")
            VALUES (1, 1001, '12-345678901-2-OVERFLOW-PIN', '123-456-789', 'PSN-0001', 'D', '99-887766554-3-OVERFLOW');
            INSERT INTO public."PhilHealthDependent" (id, "philHealthRecordId", "firstName", "lastName", relationship, gender, "isPermanentlyDisabled", citizenship)
            VALUES
                (1, 1, 'Dep', 'SpouseOne', 'Spouse', 'FEMALE', false, 'Filipino'),
                (2, 1, 'Dep', 'ChildTwo', 'Child', 'MALE', false, 'Filipino');
            INSERT INTO public."PatientInsight" (id, "patientId", "clinicId", content)
            VALUES (1, 1001, 101, 'Requires morning scheduling');

            INSERT INTO public."Appointment" (id, "clinicId", subject, complaint, "caseNumber")
            VALUES (801, 101, 'Annual Checkup', 'Mild cough', 'CASE-A801');
            INSERT INTO public."AppointmentRequester" (id, "appointmentId", "userId") VALUES (1, 801, 1001);
            INSERT INTO public."AppointmentAttribute" (id, "appointmentId", date, "timeStart", "maxDuration", status, "systemId", "isWalkIn", "modeId", "typeId", "serviceId", "preferredAppointee")
            VALUES (1, 801, '2026-03-01', '09:00', 30, 'COMPLETED', 1, false, 1, 1, 1, 701);

            INSERT INTO public."ConsultationTicket" (id, "clinicId", "clinicPatientId", "appointmentId", "systemId", subject, "isActive", "isPhilHealthKonsulta", "konsultaCoPay", "konsultaAdvice", "konsultaRecommendedDiagnosticOptions", "ekasAuthorizationCode")
            VALUES (901, 101, 501, 801, 1, 'Consult Subject', true, true, 150.00, '{"advice":"Hydrate well and rest"}'::jsonb, '{"option":"A"}'::jsonb, 'EKAS-AUTH-901');
            INSERT INTO public."ConsultationTicketAttribute" (id, "consultationTicketId", status) VALUES (1, 901, 'COMPLETED');
            INSERT INTO public."ConsultationTicketHP" (id, "consultationTicketId", "hpId") VALUES (1, 901, 701);
            INSERT INTO public."ConsultationNote" (id, "consultationTicketId", section, content) VALUES
                (1, 901, 'subjective', 'Dry cough for 2 days'),
                (2, 901, 'objective', 'Clear breath sounds'),
                (3, 901, 'assessment', 'Acute URI'),
                (4, 901, 'plan', 'Supportive care');
            INSERT INTO public."ConsultationManagement" (id, "consultationTicketId", "managementCodeId") VALUES ('cm-1', 901, 1), ('cm-2', 901, 2);

            -- Extreme overflow vitals (BMI 259106.8435, temp 736, spo2 989) MUST be sanitized to NULL instead of throwing numeric(5,2) overflow!
            INSERT INTO public."VitalSign" (id, "userId", "consultationTicketId", "dateTaken", height, weight, bmi, "bpSystolic", "bpDiastolic", "pulseRate", temp, spo2, "respRate", notes)
            VALUES (1, 1001, 901, '2026-03-01T09:15:00Z', 170.00, 68.50, 259106.8435, 118, 76, 72, 736.00, 989.00, 16, 'Sanitizer check');

            INSERT INTO public."Prescription" (id, "clinicId", "patientId", "consultationTicketId", "hpId", "serialNumber", remarks)
            VALUES (1, 101, 501, 901, 701, 'RX-001', 'Take after meals');
            INSERT INTO public."Medicine" (id, "prescriptionId", name, "genericName", "brandName", dosage, frequency, unit, duration, qty)
            VALUES (1, 1, 'Paracetamol 500mg', 'Paracetamol', 'Biogesic', '500mg', 'Every 6h PRN', 'tablet', 5, 10);
            INSERT INTO public."MedicineDispenseRecord" (id, "medicineId", "isDispensed", "dateDispensed", "dispensingPersonnel")
            VALUES (1, 1, true, '2026-03-01T10:00:00Z', 'Pharmacist One');
            INSERT INTO public."MedicinePhilHealthData" (id, "medicineId", "drugCode", route) VALUES (1, 1, 'PH-PARA-500', 'Oral');

            INSERT INTO public."ClinicLaboratoryRequest" (id, "clinicId", "clinicPatientId", "consultationTicketId", "hpId", "serialNumber", impression)
            VALUES (1, 101, 501, 901, 701, 'LAB-001', 'Baseline screening');
            INSERT INTO public."ClinicLaboratoryRequestProcedure" (id, "clinicLaboratoryRequestId", "clinicLaboratoryProcedureId") VALUES (1, 1, 1);
            INSERT INTO public."ClinicImagingRequest" (id, "clinicId", "clinicPatientId", "consultationTicketId", "hpId", "serialNumber", impression)
            VALUES (1, 101, 501, 901, 701, 'IMG-001', 'Clear lungs');
            INSERT INTO public."ClinicImagingRequestProcedure" (id, "clinicImagingRequestId", "clinicImagingProcedureId", "bodyPart") VALUES (1, 1, 1, 'Chest');
            INSERT INTO public."ClinicHeartStationRequest" (id, "clinicId", "clinicPatientId", "consultationTicketId", "hpId", "serialNumber", impression)
            VALUES (1, 101, 501, 901, 701, 'ECG-001', 'Normal sinus rhythm');
            INSERT INTO public."ClinicHeartStationRequestProcedure" (id, "clinicHeartStationRequestId", "clinicHeartStationProcedureId") VALUES (1, 1, 1);

            INSERT INTO public."ClinicMedicalCertificate" (id, "clinicId", "clinicPatientId", "consultationTicketId", "hpId", "serialNumber", "reasonId", "findingId", "classificationId", impression, remarks)
            VALUES (1, 101, 501, 901, 701, 'MC-001', 1, 1, 1, 'Cleared', 'Initial remark');

            INSERT INTO public."Folder" (id, "userId") VALUES (1, 1001);
            INSERT INTO public."FolderSetting" (id, "folderId", privacy, "scopeClinicId") VALUES (1, 1, 'CLINIC', 101);
            INSERT INTO public."File" (id, "folderId", "fileTypeId", name, size, url, "mimeType", "dateTaken")
            VALUES (1, 1, 1, 'LongTitle-' || repeat('F', 210) || '.pdf', 12345, 'https://storage.example.test/files/ecg1.pdf', 'application/' || repeat('m', 110), '2026-03-01T09:00:00Z');
            INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId") VALUES (1, 1, 'CLINIC', 101);
            INSERT INTO public."AppointmentAttachment" (id, "appointmentId", name, url)
            VALUES (1, 801, 'ApptAttach-' || repeat('A', 210) || '.jpg', 'https://storage.example.test/files/appt1.jpg');

            INSERT INTO public."PhysicalExamination" (id, "userId", "consultationTicketId", "dateTaken", "generalSurveyId", "generalSurveyRemarks", "skinId", "skinRemarks", "heentId")
            VALUES ('pe-1', 1001, 901, '2026-03-01T09:20:00Z', 'gen-norm', 'Alert and coherent', 'skin-abn', 'Mild erythema', 'heent-norm');

            INSERT INTO public."Medication" (id, "clinicId", "patientId", "hpId", name)
            VALUES (1, 101, 1001, 701, 'Metformin 500mg');
            INSERT INTO public."MedicationDrug" (id, "medicationId", "drugId", dosage, frequency, unit, notes, duration)
            VALUES (1, 1, 1, '500mg', 'Once daily', 'tablet', 'With breakfast', 30);
            """);

        var run = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, sampleLimit: null, forceV1OnConflict: false, triggeredBy: "test", ct: CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run.Status);
        Assert.True(string.IsNullOrEmpty(run.ErrorMessage));

        await using var v2 = new NpgsqlConnection(fx.ClinicConnectionString);
        await v2.OpenAsync();

        // Verify CustomFieldDefinitions healing + counts (8 USTP + 9 dynamic v1 + 13 intake = 30 active; retired primary_*/secondary_city_province inactive)
        await using (var cmd = new NpgsqlCommand("""
            SELECT COUNT(*) FILTER (WHERE "IsActive" = true AND "IsDeleted" = false),
                   MAX(CASE WHEN "FieldKey" = 'emergency_contact_phone' THEN "DataType" END),
                   MAX(CASE WHEN "FieldKey" = 'emergency_contact_phone' THEN COALESCE("BoundaryMode", '<NULL>') END),
                   BOOL_AND(CASE WHEN "FieldKey" IN ('primary_address_line','secondary_city_province') THEN NOT "IsActive" ELSE true END)
            FROM public."CustomFieldDefinitions"
            WHERE "TenantId" = @tid AND "ClinicId" = @cid
            """, v2))
        {
            cmd.Parameters.AddWithValue("tid", V2TenantId);
            cmd.Parameters.AddWithValue("cid", V2ClinicId);
            await using var r = await cmd.ExecuteReaderAsync();
            Assert.True(await r.ReadAsync());
            Assert.Equal(30L, r.GetInt64(0));
            Assert.Equal("Text", r.GetString(1));
            Assert.Equal("<NULL>", r.GetString(2));
            Assert.True(r.GetBoolean(3));
        }

        // Verify Patients CustomFields (primary_address_* fallback preserved + secondary_address_* + emergency_contact_address + philhealth_dependents)
        await using (var cmd = new NpgsqlCommand("""
            SELECT "Occupation", "VerificationStatus", "CustomFields"::text
            FROM public."Patients" WHERE "Id" = @pid
            """, v2))
        {
            cmd.Parameters.AddWithValue("pid", DeterministicUuid.ClinicPatientId(V2ClinicId, 1001));
            await using var r = await cmd.ExecuteReaderAsync();
            Assert.True(await r.ReadAsync());
            Assert.Equal("Assistant", r.GetString(0));
            Assert.Equal("Verified", r.GetString(1));
            using var doc = JsonDocument.Parse(r.GetString(2));
            Assert.Equal("100 Primary St", doc.RootElement.GetProperty("primary_address_line").GetString());
            Assert.Equal("200 Secondary Ave", doc.RootElement.GetProperty("secondary_address_line").GetString());
            Assert.Equal("9200", doc.RootElement.GetProperty("secondary_postal_code").GetString());
            Assert.Equal("999 Emergency Rd", doc.RootElement.GetProperty("emergency_contact_address").GetString());
            Assert.Equal(2, doc.RootElement.GetProperty("philhealth_dependents").GetArrayLength());
        }

        // Verify exact enum + MaxLength + Sanitizer assertions in PG17 v2 DB
        Assert.Equal("Other", await ScalarStringAsync(v2, """SELECT "Relationship" FROM public."PatientFamilyHistories" LIMIT 1"""));
        Assert.Equal("ProblemListItem", await ScalarStringAsync(v2, """SELECT "Category" FROM public."PatientMedicalHistories" WHERE "ConditionTitle" = 'Essential Hypertension' """));
        Assert.Equal("MedicalHistory", await ScalarStringAsync(v2, """SELECT "Category" FROM public."PatientMedicalHistories" WHERE "ConditionTitle" = 'Diabetes Mellitus Type 2' """));
        Assert.Equal("DD", await ScalarStringAsync(v2, """SELECT "MemberType" FROM public."PatientPhilHealthMemberships" """));
        Assert.Equal("S", await ScalarStringAsync(v2, """SELECT "DependentRelationship" FROM public."PatientPhilHealthMemberships" """));
        Assert.Equal(1L, await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientPhilHealthMemberships" """));
        Assert.Equal("DoctorConsultation", await ScalarStringAsync(v2, """SELECT "Source" FROM public."ClinicDispensingLogs" LIMIT 1"""));
        Assert.Equal("Medicine", await ScalarStringAsync(v2, """SELECT "ItemCategory" FROM public."ClinicDispensingLogs" LIMIT 1"""));
        Assert.Equal("Exempt", await ScalarStringAsync(v2, """SELECT "PaymentPolicy" FROM public."Appointments" LIMIT 1"""));
        Assert.Equal("Exempt", await ScalarStringAsync(v2, """SELECT "PaymentStatus" FROM public."Appointments" LIMIT 1"""));
        Assert.Equal("FacilityBased", await ScalarStringAsync(v2, """SELECT "ServiceDeliveryMethod" FROM public."Consultations" LIMIT 1"""));
        Assert.Equal("Issued", await ScalarStringAsync(v2, """SELECT "Stage" FROM public."LabOrders" LIMIT 1"""));
        Assert.Equal("ECGStrip", await ScalarStringAsync(v2, """SELECT "RecordType" FROM public."RecordAttachments" WHERE "Title" LIKE 'Electrocardiogram%' """));
        Assert.Equal("FitWithRestrictions", await ScalarStringAsync(v2, """SELECT "FitnessStatus" FROM public."MedicalCertificates" LIMIT 1"""));
        Assert.Equal("Normal", await ScalarStringAsync(v2, """SELECT "GeneralSurveyStatus" FROM public."PatientPhysicalExams" LIMIT 1"""));

        // Verify PersonalHistory IsSmoker / IsAlcoholDrinker
        await using (var cmd = new NpgsqlCommand("""SELECT "IsSmoker", "IsAlcoholDrinker" FROM public."PatientSocialHistories" LIMIT 1""", v2))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            Assert.True(await r.ReadAsync());
            Assert.True(r.GetBoolean(0));
            Assert.False(r.GetBoolean(1));
        }

        // Verify MedicalCertificate Purpose <= 50 & full reason preserved in Remarks
        await using (var cmd = new NpgsqlCommand("""SELECT length("Purpose"), "Remarks" FROM public."MedicalCertificates" LIMIT 1""", v2))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            Assert.True(await r.ReadAsync());
            Assert.True(r.GetInt32(0) <= 50);
            Assert.Contains("Reason: Extended Pre-Employment Medical Clearance Evaluation Exceeding Fifty Characters", r.GetString(1));
            Assert.Contains("Initial remark", r.GetString(1));
        }

        // Verify PatientVitals overflow metrics sanitized to NULL
        await using (var cmd = new NpgsqlCommand("""SELECT "Bmi", "TemperatureCelsius", "OxygenSaturationPercent", "HeightCm" FROM public."PatientVitals" LIMIT 1""", v2))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            Assert.True(await r.ReadAsync());
            Assert.True(r.IsDBNull(0));
            Assert.True(r.IsDBNull(1));
            Assert.True(r.IsDBNull(2));
            Assert.Equal(170.00m, r.GetDecimal(3));
        }

        // Verify PhysicalExamFindings (Skin=abnormal, Heent=normal) + HomeMedications synced
        Assert.Equal(2L, await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientPhysicalExamFindings" """));
        Assert.Equal(1L, await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientPhysicalExamFindings" WHERE "System" = 'Skin' AND "IsNormal" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientPhysicalExamFindings" WHERE "System" = 'Heent' AND "IsNormal" = true"""));
        Assert.Equal("Metformin", await ScalarStringAsync(v2, """SELECT "GenericDrugName" FROM public."PatientHomeMedications" LIMIT 1"""));
        Assert.Equal("Glucophage", await ScalarStringAsync(v2, """SELECT "BrandName" FROM public."PatientHomeMedications" LIMIT 1"""));
    }

    [Fact]
    public async Task Backfill_ResolvesAppointmentsConsultationsDoctorsNotesAndDispenseUpdates()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding = await CreateClinicBindingAsync(fx, "Track1 Visit Spine Semantic Mapping");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."System" (id, name) VALUES (1, 'Dental');
            INSERT INTO public."AppointmentMode" (id, name) VALUES (2, 'Virtual');
            INSERT INTO public."AppointmentType" (id, name) VALUES (1, 'Follow-up Teleconsult');
            -- Soft-deleted & inactive Service MUST still resolve ServiceType for historical appointments!
            INSERT INTO public."Service" (id, name, "isActive", "deletedAt") VALUES (9, 'Historical Dental Consult', false, '2025-12-01T00:00:00Z');
            INSERT INTO public."KonsultaManagementCode" (id, code, "sortOrder") VALUES (1, 'MGMT-A', 1), (2, 'MGMT-B', 2);

            INSERT INTO public."User" (id, "firstName", "lastName", "isActive") VALUES
                (2001, 'Synth', 'PatientTwo', true),
                (2002, 'Dr', 'RoutedDoc', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (502, 101, 2001);
            INSERT INTO public."HealthcareProvider" (id, "userId") VALUES (801, 2002);
            INSERT INTO public."HPProfile" (id, "healthcareProviderId", title, name, suffix) VALUES (1, 801, 'Dr', 'RoutedDoc', NULL);
            INSERT INTO public."ProfessionalDetails" (id, "healthcareProverId", "licenseNumber", "ptrNumber") VALUES (1, 801, 'PRC-801', 'PTR-801');

            -- Appointment with Virtual mode, soft-deleted service, AppointmentRouting (ACCEPTED) doctor, and rich notes
            INSERT INTO public."Appointment" (id, "clinicId", subject, complaint, "caseNumber")
            VALUES (810, 101, 'Teleconsult Dental', 'Toothache', 'CASE-810');
            INSERT INTO public."AppointmentRequester" (id, "appointmentId", "userId") VALUES (1, 810, 2001);
            INSERT INTO public."AppointmentAttribute" (id, "appointmentId", date, "timeStart", "maxDuration", status, "systemId", "modeId", "typeId", "serviceId", "aiSymptomAnalysis", "rejectedReason", "rescheduledReason", "dropReason")
            VALUES (1, 810, '2026-03-05', '14:00', 20, 'COMPLETED', 1, 2, 1, 9, 'Possible pulpitis', 'None', 'Moved to PM', 'N/A');
            INSERT INTO public."AppointmentRouting" (id, "appointmentId", status, "routedTo", amendment, "returnReason")
            VALUES (1, 810, 'ACCEPTED', 801, 'Updated triage', 'Clarified history');

            -- ConsultationTicket with clinicPatientId = NULL (resolved via AppointmentRequester!)
            INSERT INTO public."Appointment" (id, "clinicId", subject, complaint, "caseNumber")
            VALUES (811, 101, 'Walk-In Consult', 'Headache', 'CASE-811');
            INSERT INTO public."AppointmentRequester" (id, "appointmentId", "userId") VALUES (2, 811, 2001);
            INSERT INTO public."ConsultationTicket" (id, "clinicId", "clinicPatientId", "appointmentId", "systemId", subject, "isActive", "isPhilHealthKonsulta", "konsultaCoPay", "konsultaAdvice", "konsultaRecommendedDiagnosticOptions", "ekasAuthorizationCode")
            VALUES (911, 101, NULL, 811, 1, 'Requester-only ticket', true, true, 250.50, '{"advice":"Take analgesics"}'::jsonb, '{"code":"OPT1"}'::jsonb, 'EKAS-911');
            INSERT INTO public."ConsultationTicketHP" (id, "consultationTicketId", "hpId") VALUES (1, 911, 801);
            INSERT INTO public."ConsultationNote" (id, "consultationTicketId", section, content) VALUES (1, 911, 'subjective', 'Headache x 1d');
            INSERT INTO public."ConsultationManagement" (id, "consultationTicketId", "managementCodeId") VALUES ('cm-10', 911, 1), ('cm-11', 911, 2);

            -- Prescription initially undispensed
            INSERT INTO public."Prescription" (id, "clinicId", "patientId", "consultationTicketId", "hpId")
            VALUES (10, 101, 502, 911, 801);
            INSERT INTO public."Medicine" (id, "prescriptionId", name, "genericName", "brandName", dosage, frequency, unit, duration, qty)
            VALUES (10, 10, 'Ibuprofen 400mg', 'Ibuprofen', 'Advil', '400mg', 'TID', 'tablet', 3, 9);
            INSERT INTO public."MedicineDispenseRecord" (id, "medicineId", "isDispensed") VALUES (10, 10, false);
            """);

        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        await using var v2 = new NpgsqlConnection(fx.ClinicConnectionString);
        await v2.OpenAsync();

        // Verify Appointment 810 semantics
        await using (var cmd = new NpgsqlCommand("""
            SELECT "AppointmentType", "ServiceType", "DoctorId", "DoctorName", "Notes"
            FROM public."Appointments" WHERE "Id" = @aid
            """, v2))
        {
            cmd.Parameters.AddWithValue("aid", DeterministicUuid.SharedAppointmentId(V2ClinicId, 810));
            await using var r = await cmd.ExecuteReaderAsync();
            Assert.True(await r.ReadAsync());
            Assert.Equal("Teleconsult", r.GetString(0));
            Assert.Equal("Historical Dental Consult", r.GetString(1));
            Assert.Equal(DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, "v1_hp:801"), r.GetGuid(2));
            Assert.Equal("Dr RoutedDoc", r.GetString(3));
            var notes = r.GetString(4);
            Assert.Contains("Legacy Case #: CASE-810", notes);
            Assert.Contains("Type: Follow-up Teleconsult", notes);
            Assert.Contains("AI Symptom Analysis: Possible pulpitis", notes);
            Assert.Contains("Rescheduled Reason: Moved to PM", notes);
            Assert.Contains("Routing Notes: Updated triage / Clarified history", notes);
        }

        // Verify Requester-only ConsultationTicket 911 + Consultation missing fields
        await using (var cmd = new NpgsqlCommand("""
            SELECT "PatientId", "HasCoPayment", "CoPaymentAmount", "HomeInstructions", "DiagnosticServicesOption", "OtherMedicalAdviceSpec", "PhilHealthManagementCodes"
            FROM public."Consultations" WHERE "Id" = @cid
            """, v2))
        {
            cmd.Parameters.AddWithValue("cid", DeterministicUuid.SharedConsultationId(V2ClinicId, 911));
            await using var r = await cmd.ExecuteReaderAsync();
            Assert.True(await r.ReadAsync());
            Assert.Equal(DeterministicUuid.ClinicPatientId(V2ClinicId, 2001), r.GetGuid(0));
            Assert.True(r.GetBoolean(1));
            Assert.Equal(250.50m, r.GetDecimal(2));
            Assert.Equal("Take analgesics", r.GetString(3));
            Assert.Equal("OPT1", r.GetString(4));
            Assert.Equal("EKAS-911", r.GetString(5));
            Assert.Equal("MGMT-A,MGMT-B", r.GetString(6));
        }

        // Update MedicineDispenseRecord to dispensed and re-run Backfill -> Prescriptions ON CONFLICT updates dispense columns
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."MedicineDispenseRecord"
            SET "isDispensed" = true, "dateDispensed" = '2026-03-06T11:30:00Z', "dispensingPersonnel" = 'Pharmacist Two'
            WHERE id = 10;
            """);

        var run2 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run2.Status);

        await using (var cmd = new NpgsqlCommand("""
            SELECT "IsDispensed", "DispensingPersonnel", "DispensedQuantity", "IsClinicDispensed", "ClinicDispensedBy", "ClinicDispensedQuantity"
            FROM public."Prescriptions" WHERE "Id" = @rxid
            """, v2))
        {
            cmd.Parameters.AddWithValue("rxid", DeterministicUuid.SharedPrescriptionId(V2ClinicId, 10));
            await using var r = await cmd.ExecuteReaderAsync();
            Assert.True(await r.ReadAsync());
            Assert.True(r.GetBoolean(0));
            Assert.Equal("Pharmacist Two", r.GetString(1));
            Assert.Equal(9, r.GetInt32(2));
            Assert.True(r.GetBoolean(3));
            Assert.Equal("Pharmacist Two", r.GetString(4));
            Assert.Equal(9, r.GetInt32(5));
        }
    }

    [Fact]
    public async Task DbBackedQueueItemIdAndNaturalUniqueKeys_PreventCrossRunCollisions()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding = await CreateClinicBindingAsync(fx, "Track1 Cross-Run Queue & Unique Keys");

        var uid = 3001;
        var v2Pid = DeterministicUuid.ClinicPatientId(V2ClinicId, uid);
        var foreignAddrId = Guid.NewGuid();
        var foreignPhId = Guid.NewGuid();
        var foreignSocId = Guid.NewGuid();
        var foreignReproId = Guid.NewGuid();

        // Pre-seed v2 rows with non-deterministic UUIDs matching natural unique indexes
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $$"""
            INSERT INTO public."Patients" ("Id","PatientCode","FirstName","LastName","Sex","ContactNumber","CustomFields","VerificationStatus","ShareGrantScopes","TenantId","ClinicId")
            VALUES ('{{v2Pid}}','V1-{{uid:D6}}','Synth','PatientThree','Male','09170003001','{}'::jsonb,'Verified','','{{V2TenantId}}','{{V2ClinicId}}');

            INSERT INTO public."PatientAddresses" ("Id","PatientId","AddressType","IsSameAsPermanent","StreetAddress","TenantId","ClinicId")
            VALUES ('{{foreignAddrId}}','{{v2Pid}}','Permanent',false,'Initial Natural St','{{V2TenantId}}','{{V2ClinicId}}');

            INSERT INTO public."PatientPhilHealthMemberships" ("Id","PatientId","MemberType","MemberPin","TenantId","ClinicId")
            VALUES ('{{foreignPhId}}','{{v2Pid}}','MM','120000000001','{{V2TenantId}}','{{V2ClinicId}}');

            INSERT INTO public."PatientSocialHistories" ("Id","PatientId","IsSmoker","IsAlcoholDrinker","UsesIllicitDrugs","IsSexuallyActive","IsPhysicallyActive","UsesFluorideToothpaste","TenantId","ClinicId")
            VALUES ('{{foreignSocId}}','{{v2Pid}}',false,false,false,false,false,false,'{{V2TenantId}}','{{V2ClinicId}}');

            INSERT INTO public."PatientReproductiveHistories" ("Id","PatientId","IsApplicable","IsMenopausal","IsCurrentlyPregnant","Gravidity","Parity","TermBirths","PretermBirths","Abortions","LivingChildren","MiscarriagesCount","EctopicCount","StillbirthsCount","HadGestationalDiabetes","HadPostpartumHemorrhage","HadPreEclampsiaHypertension","ReceivedFamilyPlanningCounseling","TenantId","ClinicId")
            VALUES ('{{foreignReproId}}','{{v2Pid}}',true,false,false,0,0,0,0,0,0,0,0,0,false,false,false,false,'{{V2TenantId}}','{{V2ClinicId}}');
            """);

        // Run 1: Seed User + natural-key children + Appointment + PreAssessmentNote (no VitalSign or ConsultationTicket yet)
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "isActive")
            VALUES (3001, 'Synth', 'PatientThree', 'MALE', '09170003001', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (503, 101, 3001);
            INSERT INTO public."UserAddress" (id, "userId", "addressLine", "isPrimary") VALUES (31, 3001, 'Updated V1 Address', true);
            INSERT INTO public."PhilHealthRecord" (id, "userId", pin, "memberType") VALUES (31, 3001, '120000000002', 'M');
            INSERT INTO public."PersonalHistory" (id, "userId", "smokingStatus") VALUES (31, 3001, 'YES');
            INSERT INTO public."ObGyneHistory" (id, "userId", gravidity, parity) VALUES (31, 3001, 2, 2);

            INSERT INTO public."Appointment" (id, "clinicId", subject) VALUES (820, 101, 'Follow-up');
            INSERT INTO public."AppointmentRequester" (id, "appointmentId", "userId") VALUES (1, 820, 3001);
            INSERT INTO public."AppointmentAttribute" (id, "appointmentId", date, status) VALUES (1, 820, '2026-03-10', 'COMPLETED');
            INSERT INTO public."PreAssessmentNote" (id, "clinicId", "appointmentId", assessment, remarks)
            VALUES (51, 101, 820, 'Triage stable', 'Initial pre-assess');
            """);

        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, forceV1OnConflict: true, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        // Between runs: Add VitalSign + TWO ConsultationTickets sharing the same appointmentId 820!
        // Run 2 MUST check DB-backed Consultations.QueueItemId & PatientVitals.QueueItemId across runs so no IX_Consultations_QueueItemId or IX_PatientVitals_QueueItemId violation occurs.
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."ConsultationTicket" (id, "clinicId", "clinicPatientId", "appointmentId", subject, "isActive")
            VALUES
                (920, 101, 503, 820, 'Primary Consult', true),
                (921, 101, 503, 820, 'Secondary Consult Same Appt', true);
            INSERT INTO public."VitalSign" (id, "userId", "consultationTicketId", "dateTaken", "bpSystolic", "bpDiastolic")
            VALUES (52, 3001, 920, '2026-03-10T09:00:00Z', 120, 80);
            UPDATE public."PreAssessmentNote" SET assessment = 'Updated triage assessment', "updatedAt" = now() WHERE id = 51;
            """);

        var run2 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, forceV1OnConflict: true, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run2.Status);

        await using var v2 = new NpgsqlConnection(fx.ClinicConnectionString);
        await v2.OpenAsync();

        // Natural unique keys were adopted in-place (still 1 row each with the pre-existing UUIDs updated!)
        Assert.Equal("Updated V1 Address", await ScalarStringAsync(v2, $"""SELECT "StreetAddress" FROM public."PatientAddresses" WHERE "Id" = '{foreignAddrId}' """));
        Assert.Equal("120000000002", await ScalarStringAsync(v2, $"""SELECT "MemberPin" FROM public."PatientPhilHealthMemberships" WHERE "Id" = '{foreignPhId}' """));
        Assert.Equal(1L, await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientSocialHistories" """));
        Assert.Equal(1L, await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientReproductiveHistories" """));

        // Both consultations exist with distinct QueueItemIds (no collision!)
        Assert.Equal(2L, await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."Consultations" """));
        Assert.Equal(2L, await ScalarInt64Async(v2, """SELECT COUNT(DISTINCT "QueueItemId") FROM public."Consultations" """));

        // PreAssessmentNote row exists and VitalSign did not collide on IX_PatientVitals_QueueItemId
        Assert.True(await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientVitals" """) >= 1L);
        Assert.Equal("Updated triage assessment", await ScalarStringAsync(v2, """SELECT "PreAssessmentNotes" FROM public."PatientVitals" WHERE "PreAssessmentNotes" IS NOT NULL LIMIT 1"""));
    }

    [Fact]
    public async Task V2WinsKeepV2AndForceV1_WorkForPatientsAndChildEntities()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding = await CreateClinicBindingAsync(fx, "Track1 V2-Wins & ForceV1 Test");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."Allergen" (id, name) VALUES (1, 'Penicillin');
            INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "verificationStatus", "isActive")
            VALUES (4001, 'Synth', 'PatientFour', 'FEMALE', '09170004001', 'VERIFIED', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (504, 101, 4001);
            INSERT INTO public."UserEmploymentRecord" (id, "userId", "organizationId", position) VALUES (41, 4001, 201, 'Nurse');
            INSERT INTO public."UserAddress" (id, "userId", "addressLine", "isPrimary") VALUES (41, 4001, 'V1 Street 1', true);
            INSERT INTO public."UserAllergy" (id, "userId", "allergenId", reaction) VALUES (41, 4001, 1, 'Rash');
            """);

        // Run 1: initial backfill
        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        // Simulate staff edits in v2 on Patient (Occupation), PatientAddress (StreetAddress), and PatientAllergy (ReactionManifestation)
        var v2Pid = DeterministicUuid.ClinicPatientId(V2ClinicId, 4001);
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $"""
            UPDATE public."Patients" SET "Occupation" = 'Senior Nurse (V2 Edit)', "UpdatedBy" = 'clinic_staff', "UpdatedAt" = now() WHERE "Id" = '{v2Pid}';
            UPDATE public."PatientAddresses" SET "StreetAddress" = 'V2 Edited Street', "UpdatedBy" = 'clinic_staff', "UpdatedAt" = now() WHERE "PatientId" = '{v2Pid}';
            UPDATE public."PatientAllergies" SET "ReactionManifestation" = 'Anaphylaxis (V2 Edit)', "UpdatedBy" = 'clinic_staff', "UpdatedAt" = now() WHERE "PatientId" = '{v2Pid}';
            """);

        // Also mutate v1 slightly so incoming hash differs from stored hash, triggering v2-wins conflict
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."UserEmploymentRecord" SET position = 'Chief Nurse (V1 Edit)', "updatedAt" = now() WHERE id = 41;
            UPDATE public."User" SET "updatedAt" = now() WHERE id = 4001;
            UPDATE public."UserAddress" SET "addressLine" = 'V1 Street 2', "updatedAt" = now() WHERE id = 41;
            UPDATE public."UserAllergy" SET reaction = 'Mild Hives (V1 Edit)' WHERE id = 41;
            """);

        // Run 2: v2-wins MUST preserve v2 edits and open V2_MODIFIED conflicts
        var run2 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run2.Status);

        var (conflicts, _) = await fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, 50, 0);
        Assert.Contains(conflicts, c => c.EntityType == "Patient" && c.ConflictType == SyncConflictType.V2Modified);
        Assert.Contains(conflicts, c => c.EntityType == "PatientAddress" && c.ConflictType == SyncConflictType.V2Modified);
        Assert.Contains(conflicts, c => c.EntityType == "PatientAllergy" && c.ConflictType == SyncConflictType.V2Modified);

        await using var v2 = new NpgsqlConnection(fx.ClinicConnectionString);
        await v2.OpenAsync();
        Assert.Equal("Senior Nurse (V2 Edit)", await ScalarStringAsync(v2, $"""SELECT "Occupation" FROM public."Patients" WHERE "Id" = '{v2Pid}' """));
        Assert.Equal("V2 Edited Street", await ScalarStringAsync(v2, $"""SELECT "StreetAddress" FROM public."PatientAddresses" WHERE "PatientId" = '{v2Pid}' """));
        Assert.Equal("Anaphylaxis (V2 Edit)", await ScalarStringAsync(v2, $"""SELECT "ReactionManifestation" FROM public."PatientAllergies" WHERE "PatientId" = '{v2Pid}' """));

        // Resolve Patient conflict as KEEP_V2 -> subsequent backfill must NOT reopen a duplicate conflict
        var patientConflict = conflicts.First(c => c.EntityType == "Patient");
        var keepRes = await fx.Coordinator.ResolveConflictAsync(patientConflict.Id, "KEEP_V2", "test", CancellationToken.None);
        Assert.NotNull(keepRes);
        Assert.Equal(SyncConflictStatus.ResolvedKeepV2, keepRes!.Conflict.Status);

        var run3 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run3.Status);
        var (afterKeepConflicts, _) = await fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, 50, 0);
        Assert.DoesNotContain(afterKeepConflicts, c => c.EntityType == "Patient" && c.ConflictType == SyncConflictType.V2Modified);

        // Now resolve PatientAddress and PatientAllergy with FORCE_V1 -> immediate single-entity sync MUST overwrite v2 with v1!
        var addrConflict = conflicts.First(c => c.EntityType == "PatientAddress");
        var allergyConflict = conflicts.First(c => c.EntityType == "PatientAllergy");

        var forceAddr = await fx.Coordinator.ResolveConflictAsync(addrConflict.Id, "FORCE_V1", "test", CancellationToken.None);
        Assert.NotNull(forceAddr);
        Assert.Equal(SyncConflictStatus.ResolvedForceV1, forceAddr!.Conflict.Status);
        Assert.NotNull(forceAddr.Run);
        Assert.Equal(SyncRunStatus.Completed, forceAddr.Run!.Status);

        var forceAllergy = await fx.Coordinator.ResolveConflictAsync(allergyConflict.Id, "FORCE_V1", "test", CancellationToken.None);
        Assert.NotNull(forceAllergy);
        Assert.Equal(SyncConflictStatus.ResolvedForceV1, forceAllergy!.Conflict.Status);
        Assert.NotNull(forceAllergy.Run);
        Assert.Equal(SyncRunStatus.Completed, forceAllergy.Run!.Status);

        Assert.Equal("V1 Street 2", await ScalarStringAsync(v2, $"""SELECT "StreetAddress" FROM public."PatientAddresses" WHERE "PatientId" = '{v2Pid}' """));
        Assert.Equal("Mild Hives (V1 Edit)", await ScalarStringAsync(v2, $"""SELECT "ReactionManifestation" FROM public."PatientAllergies" WHERE "PatientId" = '{v2Pid}' """));
        Assert.Equal("Senior Nurse (V2 Edit)", await ScalarStringAsync(v2, $"""SELECT "Occupation" FROM public."Patients" WHERE "Id" = '{v2Pid}' """));
    }

    [Fact]
    public async Task IncrementalCdcDrainAndDeletionShield_HandleMultiBatchAndPrivacyRevocation()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding = await CreateClinicBindingAsync(fx, "Track1 CDC MultiBatch & Deletion Shield");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."Allergen" (id, name) VALUES (1, 'Dust');
            INSERT INTO public."FileType" (id, name) VALUES (1, 'Laboratory Result');
            INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "isActive")
            VALUES
                (5001, 'Synth', 'ParentSoftDel', 'MALE', '09170005001', true),
                (5002, 'Synth', 'ParentHardDel', 'FEMALE', '09170005002', true),
                (5003, 'Synth', 'ChildAndPrivacy', 'MALE', '09170005003', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES
                (505, 101, 5001),
                (506, 101, 5002),
                (507, 101, 5003);
            INSERT INTO public."UserAllergy" (id, "userId", "allergenId", reaction) VALUES (51, 5003, 1, 'Sneezing');
            INSERT INTO public."PhysicalExamination" (id, "userId", "dateTaken", "generalSurveyRemarks")
            VALUES ('pe-5003', 5003, '2026-03-11T09:00:00Z', 'Normal');
            INSERT INTO public."Medication" (id, "clinicId", "patientId", name) VALUES (51, 101, 5003, 'Cetirizine');
            INSERT INTO public."Folder" (id, "userId") VALUES (51, 5003);
            INSERT INTO public."FolderSetting" (id, "folderId", privacy, "scopeClinicId") VALUES (51, 51, 'CLINIC', 101);
            INSERT INTO public."File" (id, "folderId", "fileTypeId", name, size, url, "mimeType")
            VALUES (51, 51, 1, 'SharedLab.pdf', 1000, 'https://storage.example.test/files/shared51.pdf', 'application/pdf');
            INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId") VALUES (51, 51, 'CLINIC', 101);

            -- OrgMemberRequirementFile belonging to a DIFFERENT clinic (102) MUST NOT leak into clinic 101!
            INSERT INTO public."OrganizationMember" (id, "organizationId", "userId") VALUES (701, 201, 5003);
            INSERT INTO public."ClinicOrganization" (id, "clinicId", "organizationId") VALUES (1, 102, 201);
            INSERT INTO public."Folder" (id, "userId") VALUES (52, 5003);
            INSERT INTO public."File" (id, "folderId", "fileTypeId", name, size, url, "mimeType")
            VALUES (52, 52, 1, 'OtherClinicReq.pdf', 1000, 'https://storage.example.test/files/other52.pdf', 'application/pdf');
            INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId") VALUES (52, 52, 'ORG', NULL);
            INSERT INTO public."OrgMemberRequirementFile" (id, "orgMemberId", "fileId") VALUES (1, 701, 52);
            """);

        // Initial backfill
        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        await using var v2 = new NpgsqlConnection(fx.ClinicConnectionString);
        await v2.OpenAsync();
        // Verify File 52 from another ClinicOrganization was NOT synced into clinic 101
        Assert.Equal(0L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."RecordAttachments" WHERE "Id" = '{DeterministicUuid.ClinicAttachmentFromFileId(V2ClinicId, 52)}' """));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."RecordAttachments" WHERE "Id" = '{DeterministicUuid.ClinicAttachmentFromFileId(V2ClinicId, 51)}' """));

        // Clear any backfill-seeded changelog noise, insert >5000 synthetic CDC rows to exercise HasMore multi-batch drain,
        // then trigger real parent soft delete, parent hard delete, child deletes, and FileSetting privacy = 'PRIVATE'!
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO _v1_sync.changelog (table_name, op, row_id, pk_json)
            SELECT 'System', 'U', (90000 + g)::text, jsonb_build_object('id', 90000 + g)
            FROM generate_series(1, 5100) AS g;

            -- Parent soft delete (5001)
            UPDATE public."User" SET "deletedAt" = now() WHERE id = 5001;
            -- Parent hard delete (5002)
            DELETE FROM public."ClinicPatient" WHERE id = 506;
            DELETE FROM public."User" WHERE id = 5002;
            -- Child deletes & FileSetting privacy revocation (5003)
            DELETE FROM public."UserAllergy" WHERE id = 51;
            DELETE FROM public."PhysicalExamination" WHERE id = 'pe-5003';
            DELETE FROM public."Medication" WHERE id = 51;
            UPDATE public."FileSetting" SET privacy = 'PRIVATE' WHERE id = 51;
            """);

        var incRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, incRun.Status);

        // Multi-batch drain MUST advance cursor all the way to max(seq) -> 0 lag!
        var parity = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.Equal(0L, parity.ChangelogLag);

        // Deletion Shield MUST preserve all v2 rows (IsDeleted = false) and emit V1_SOFT_DELETED_SHIELDED conflicts!
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."Patients" WHERE "Id" = '{DeterministicUuid.ClinicPatientId(V2ClinicId, 5001)}' AND "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."Patients" WHERE "Id" = '{DeterministicUuid.ClinicPatientId(V2ClinicId, 5002)}' AND "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientAllergies" WHERE "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientPhysicalExams" WHERE "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientHomeMedications" WHERE "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."RecordAttachments" WHERE "Id" = '{DeterministicUuid.ClinicAttachmentFromFileId(V2ClinicId, 51)}' AND "IsDeleted" = false"""));

        var (shieldConflicts, _) = await fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, 50, 0);
        Assert.Contains(shieldConflicts, c => c.EntityType == "Patient" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(shieldConflicts, c => c.EntityType == "PatientAllergy" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(shieldConflicts, c => c.EntityType == "PatientPhysicalExam" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(shieldConflicts, c => c.EntityType == "PatientHomeMedication" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(shieldConflicts, c => c.EntityType == "RecordAttachment" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
    }

    [Fact]
    public async Task FinalSweepAndParityReport_VerifyZeroLagAndTrueCounts()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding = await CreateClinicBindingAsync(fx, "Track1 FinalSweep & True Parity Test");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "isActive")
            VALUES (6001, 'Synth', 'PatientSix', 'MALE', '09170006001', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (508, 101, 6001);
            INSERT INTO public."PhysicalExamination" (id, "userId", "dateTaken", "generalSurveyRemarks")
            VALUES ('pe-6001', 6001, '2026-03-12T10:00:00Z', 'Clear');
            INSERT INTO public."Medication" (id, "clinicId", "patientId", name) VALUES (61, 101, 6001, 'Atorvastatin');
            """);

        var sweep1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.FinalSweep, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, sweep1.Status);

        var parityMatched = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.Equal(0L, parityMatched.ChangelogLag);
        Assert.All(parityMatched.Checks, c => Assert.True(c.IsMatched, $"Expected {c.EntityType} parity matched"));
        Assert.True(parityMatched.ReadyToFreeze);

        // Delete 1 v2 PatientPhysicalExam row directly -> true-count parity MUST detect mismatch & block ReadyToFreeze!
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, """DELETE FROM public."PatientPhysicalExams";""");

        var parityMismatch = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.Contains(parityMismatch.Checks, c => !c.IsMatched);
        Assert.False(parityMismatch.ReadyToFreeze);
        var peItem = Assert.Single(parityMismatch.Checks, i => i.EntityType == "PatientPhysicalExams");
        Assert.Equal(1L, peItem.V1ExpectedCount);
        Assert.Equal(0L, peItem.V2ActualCount);
        Assert.False(peItem.IsMatched);

        // FinalSweep heals missing row and brings parity back to matched
        var sweep2 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.FinalSweep, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, sweep2.Status);
        var parityHealed = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        Assert.All(parityHealed.Checks, c => Assert.True(c.IsMatched, $"Expected {c.EntityType} parity matched after FinalSweep"));
        Assert.True(parityHealed.ReadyToFreeze);
    }

    [Fact]
    public async Task OrgMemberWithSoftDeletedClinicPatient_PreventsFkCrashMatchesParityAndShieldsPostDeleteChildUpdates()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding = await CreateClinicBindingAsync(fx, "Track1 OrgMember SoftDeleted CP Test");

        // 1. User 7101 is an OrganizationMember with a soft-deleted ClinicPatient and an active UserAddress.
        // Initial Backfill MUST NOT throw 23503 FK crash and parity MUST match (0 == 0).
        // 2. User 7102 is active ClinicPatient + OrganizationMember (synced in Run 1, then User soft-deleted + child updated, and CP hard-deleted for 7103).
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "isActive")
            VALUES
                (7101, 'Synth', 'OrgSoftDel', 'MALE', '09170007101', true),
                (7102, 'Synth', 'PostDelChild', 'FEMALE', '09170007102', true),
                (7103, 'Synth', 'OrgHardDelCp', 'MALE', '09170007103', true);
            INSERT INTO public."OrganizationMember" (id, "organizationId", "userId") VALUES
                (8101, 201, 7101),
                (8102, 201, 7102),
                (8103, 201, 7103);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId", "deletedAt") VALUES
                (8201, 101, 7101, now()),
                (8202, 101, 7102, NULL),
                (8203, 101, 7103, NULL);
            INSERT INTO public."UserAddress" (id, "userId", "addressLine", "isPrimary") VALUES
                (8301, 7101, 'Never Insert Child St', true),
                (8302, 7102, 'Original Safe St', true);
            """);

        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        var parity1 = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        var patCheck = Assert.Single(parity1.Checks, c => c.EntityType == "Patients");
        Assert.Equal(2L, patCheck.V1ExpectedCount);
        Assert.Equal(2L, patCheck.V2ActualCount);
        Assert.True(patCheck.IsMatched);
        Assert.True(parity1.ReadyToFreeze);

        await using var v2 = new NpgsqlConnection(fx.ClinicConnectionString);
        await v2.OpenAsync();
        Assert.Equal(0L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."Patients" WHERE "Id" = '{DeterministicUuid.ClinicPatientId(V2ClinicId, 7101)}' """));

        // Soft-delete User 7102 AND mutate their UserAddress in CDC; hard-delete ClinicPatient 8203 while 7103 stays OrganizationMember
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."User" SET "deletedAt" = now() WHERE id = 7102;
            UPDATE public."UserAddress" SET "addressLine" = 'Mutated After SoftDelete', "updatedAt" = now() WHERE id = 8302;
            DELETE FROM public."ClinicPatient" WHERE id = 8203;
            """);

        var incRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, incRun.Status);

        // Post-delete UserAddress update MUST NOT mutate PatientAddresses in v2!
        Assert.Equal("Original Safe St", await ScalarStringAsync(v2, $"""SELECT "StreetAddress" FROM public."PatientAddresses" WHERE "PatientId" = '{DeterministicUuid.ClinicPatientId(V2ClinicId, 7102)}' """));

        // 7102 has SHIELDED conflict; 7103 (hard-deleted ClinicPatient but active OrganizationMember) has NO contradictory SHIELDED conflict!
        var (conflicts, _) = await fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, 50, 0);
        Assert.Contains(conflicts, c => c.EntityType == "Patient" && c.V1Id == "7102" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.DoesNotContain(conflicts, c => c.EntityType == "Patient" && c.V1Id == "7103" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
    }

    [Fact]
    public async Task MultiOrgRequirementFiles_DoNotLeakClinicScopedFilesAcrossClinics()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding101 = await CreateClinicBindingAsync(fx, "Clinic 101 MultiOrg");
        var v2Clinic102 = Guid.Parse("22222222-3333-4444-5555-666666666666");
        var binding102 = await CreateClinicBindingAsync(fx, "Clinic 102 MultiOrg", v1ClinicId: 102, v1OrgId: V1OrgId, v2ClinicId: v2Clinic102);

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."FileType" (id, name) VALUES (1, 'Laboratory Result');
            INSERT INTO public."ClinicOrganization" (id, "clinicId", "organizationId") VALUES (1, 101, 201), (2, 102, 201);
            INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "isActive")
            VALUES (7201, 'Synth', 'MultiOrgPat', 'FEMALE', '09170007201', true);
            INSERT INTO public."OrganizationMember" (id, "organizationId", "userId") VALUES (8401, 201, 7201);

            -- File 7201: CLINIC privacy shared ONLY with Clinic 102 (MUST NOT leak into Clinic 101!)
            INSERT INTO public."Folder" (id, "userId") VALUES (7201, 7201);
            INSERT INTO public."FolderSetting" (id, "folderId", privacy, "scopeClinicId") VALUES (7201, 7201, 'CLINIC', NULL);
            INSERT INTO public."File" (id, "folderId", "fileTypeId", name, size, url, "mimeType")
            VALUES (7201, 7201, 1, 'Clinic102OnlyReq.pdf', 100, 'https://storage.example.test/files/c102-only.pdf', 'application/pdf');
            INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId") VALUES (7201, 7201, 'CLINIC', NULL);
            INSERT INTO public."FileClinicShare" (id, "fileSettingId", "clinicId") VALUES (7201, 7201, 102);
            INSERT INTO public."OrgMemberRequirementFile" (id, "orgMemberId", "fileId") VALUES (7201, 8401, 7201);

            -- File 7202: PUBLIC privacy OrgMemberRequirementFile (allowed in both Clinic 101 and Clinic 102)
            INSERT INTO public."Folder" (id, "userId") VALUES (7202, 7201);
            INSERT INTO public."FolderSetting" (id, "folderId", privacy, "scopeClinicId") VALUES (7202, 7202, 'PUBLIC', NULL);
            INSERT INTO public."File" (id, "folderId", "fileTypeId", name, size, url, "mimeType")
            VALUES (7202, 7202, 1, 'PublicOrgReq.pdf', 100, 'https://storage.example.test/files/pub-org.pdf', 'application/pdf');
            INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId") VALUES (7202, 7202, 'PUBLIC', NULL);
            INSERT INTO public."OrgMemberRequirementFile" (id, "orgMemberId", "fileId") VALUES (7202, 8401, 7202);
            """);

        var run101 = await fx.Coordinator.ExecuteAsync(binding101.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run101.Status);
        var run102 = await fx.Coordinator.ExecuteAsync(binding102.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run102.Status);

        await using var v2 = new NpgsqlConnection(fx.ClinicConnectionString);
        await v2.OpenAsync();
        Assert.Equal(0L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."RecordAttachments" WHERE "ClinicId" = '{V2ClinicId}' AND "Id" = '{DeterministicUuid.ClinicAttachmentFromFileId(V2ClinicId, 7201)}' """));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."RecordAttachments" WHERE "ClinicId" = '{V2ClinicId}' AND "Id" = '{DeterministicUuid.ClinicAttachmentFromFileId(V2ClinicId, 7202)}' """));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."RecordAttachments" WHERE "ClinicId" = '{v2Clinic102}' AND "Id" = '{DeterministicUuid.ClinicAttachmentFromFileId(v2Clinic102, 7201)}' """));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."RecordAttachments" WHERE "ClinicId" = '{v2Clinic102}' AND "Id" = '{DeterministicUuid.ClinicAttachmentFromFileId(v2Clinic102, 7202)}' """));

        var parity101 = await fx.Coordinator.GetParityReportAsync(binding101.Id, CancellationToken.None);
        var attCheck101 = Assert.Single(parity101.Checks, c => c.EntityType == "RecordAttachments");
        Assert.Equal(1L, attCheck101.V1ExpectedCount);
        Assert.Equal(1L, attCheck101.V2ActualCount);
        Assert.True(attCheck101.IsMatched);
    }

    [Fact]
    public async Task RealClinicDbColumnWidthsAndPrecision_ClampAndSanitizeWithoutOverflow()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding = await CreateClinicBindingAsync(fx, "Track1 Column Width & Numeric Precision Test");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "isActive")
            VALUES
                (7301, repeat('F', 95), repeat('L', 95), 'MALE', '09170007301', true),
                (7302, 'Dr', 'LongCreds', 'FEMALE', '09170007302', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (8501, 101, 7301);
            INSERT INTO public."OrganizationMember" (id, "organizationId", "userId") VALUES (8502, 201, 7301);
            INSERT INTO public."UserEmploymentRecord" (id, "userId", "organizationId", position)
            VALUES (8501, 7301, 201, 'SeniorDirector-' || repeat('P', 120));
            INSERT INTO public."PersonalHistory" (id, "userId", "smokingStatus", "numberOfPacksPerYear")
            VALUES (8501, 7301, 'CURRENT', 1500);

            INSERT INTO public."HealthcareProvider" (id, "userId") VALUES (8501, 7302);
            INSERT INTO public."ProfessionalDetails" (id, "healthcareProverId", "licenseNumber", "ptrNumber")
            VALUES (8501, 8501, 'PRC-' || repeat('9', 60), 'PTR-' || repeat('8', 60));

            INSERT INTO public."Appointment" (id, "clinicId", subject) VALUES (8501, 101, 'Width check');
            INSERT INTO public."AppointmentRequester" (id, "appointmentId", "userId") VALUES (8501, 8501, 7301);
            INSERT INTO public."AppointmentAttribute" (id, "appointmentId", date, status) VALUES (8501, 8501, '2026-04-01', 'COMPLETED');
            INSERT INTO public."ConsultationTicket" (id, "clinicId", "clinicPatientId", "appointmentId", subject, "isActive")
            VALUES (8501, 101, 8501, 8501, 'Width consult', true);
            INSERT INTO public."ConsultationTicketHP" (id, "consultationTicketId", "hpId") VALUES (8501, 8501, 8501);
            INSERT INTO public."VitalSign" (id, "userId", "consultationTicketId", height, weight)
            VALUES (8501, 7301, 8501, 12000.00, 70.00);
            """);

        var run = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run.Status);

        await using var v2 = new NpgsqlConnection(fx.ClinicConnectionString);
        await v2.OpenAsync();
        var v2Pid = DeterministicUuid.ClinicPatientId(V2ClinicId, 7301);
        Assert.Equal(100, (await ScalarStringAsync(v2, $"""SELECT "Occupation" FROM public."Patients" WHERE "Id" = '{v2Pid}' """))!.Length);
        Assert.Equal(150, (await ScalarStringAsync(v2, $"""SELECT "PatientName" FROM public."Consultations" WHERE "PatientId" = '{v2Pid}' """))!.Length);
        Assert.Equal(50, (await ScalarStringAsync(v2, $"""SELECT "DoctorPrcLicense" FROM public."Consultations" WHERE "PatientId" = '{v2Pid}' """))!.Length);
        Assert.Equal(50, (await ScalarStringAsync(v2, $"""SELECT "DoctorPtr" FROM public."Consultations" WHERE "PatientId" = '{v2Pid}' """))!.Length);
        Assert.Null(await ScalarStringAsync(v2, $"""SELECT "SmokingPackYears" FROM public."PatientSocialHistories" WHERE "PatientId" = '{v2Pid}' """));
        Assert.Null(await ScalarStringAsync(v2, $"""SELECT "HeightCm" FROM public."PatientVitals" WHERE "PatientId" = '{v2Pid}' """));
    }

    [Fact]
    public async Task MultiplePreAssessmentNotesPerAppointment_AggregateAndRespectV2WinsAndIdempotency()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding = await CreateClinicBindingAsync(fx, "Track1 Multi PreAssessmentNote Test");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "isActive")
            VALUES (7401, 'Synth', 'PreAssessPat', 'FEMALE', '09170007401', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (8601, 101, 7401);

            -- Appt 8601: TWO PreAssessmentNotes and NO VitalSign
            INSERT INTO public."Appointment" (id, "clinicId", subject) VALUES (8601, 101, 'PreAssess Appt 1');
            INSERT INTO public."AppointmentRequester" (id, "appointmentId", "userId") VALUES (8601, 8601, 7401);
            INSERT INTO public."AppointmentAttribute" (id, "appointmentId", date, status) VALUES (8601, 8601, '2026-04-02', 'COMPLETED');
            INSERT INTO public."PreAssessmentNote" (id, "clinicId", "appointmentId", assessment, remarks) VALUES
                (8601, 101, 8601, 'First Note', 'Rem 1'),
                (8602, 101, 8601, 'Second Note', 'Rem 2');

            -- Appt 8602: VitalSign + PreAssessmentNote sharing QueueItemId
            INSERT INTO public."Appointment" (id, "clinicId", subject) VALUES (8602, 101, 'PreAssess Appt 2');
            INSERT INTO public."AppointmentRequester" (id, "appointmentId", "userId") VALUES (8602, 8602, 7401);
            INSERT INTO public."AppointmentAttribute" (id, "appointmentId", date, status) VALUES (8602, 8602, '2026-04-03', 'COMPLETED');
            INSERT INTO public."ConsultationTicket" (id, "clinicId", "clinicPatientId", "appointmentId", subject, "isActive")
            VALUES (8602, 101, 8601, 8602, 'Consult w/ Vitals', true);
            INSERT INTO public."VitalSign" (id, "userId", "consultationTicketId", "bpSystolic", "bpDiastolic")
            VALUES (8602, 7401, 8602, 120, 80);
            INSERT INTO public."PreAssessmentNote" (id, "clinicId", "appointmentId", assessment, remarks)
            VALUES (8603, 101, 8602, 'Merged PreAssess V1', 'Merged Rem');
            """);

        // Run 1: preserves BOTH notes on 8601 and merges 8603 into VitalSign 8602
        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        await using var v2 = new NpgsqlConnection(fx.ClinicConnectionString);
        await v2.OpenAsync();
        var v2PreOnlyId = DeterministicUuid.SharedPreAssessmentVitalsId(V2ClinicId, 8601);
        var v2VitalMergedId = DeterministicUuid.SharedVitalsId(V2ClinicId, 8602);
        Assert.Equal("First Note\n\nSecond Note", await ScalarStringAsync(v2, $"""SELECT "PreAssessmentNotes" FROM public."PatientVitals" WHERE "Id" = '{v2PreOnlyId}' """));
        Assert.Equal("Merged PreAssess V1", await ScalarStringAsync(v2, $"""SELECT "PreAssessmentNotes" FROM public."PatientVitals" WHERE "Id" = '{v2VitalMergedId}' """));

        // Run 2 (zero v1 changes): MUST report Unchanged = 3 (preassess:8601 + vital:8602 + preassess:8603), Updated = 0, QueueItem Created = 0!
        var run2 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run2.Status);
        var sum2 = JsonSerializer.Deserialize<SyncRunSummary>(run2.Summary.GetRawText(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        Assert.Equal(0, sum2.For("PatientVitals").Created);
        Assert.Equal(0, sum2.For("PatientVitals").Updated);
        Assert.Equal(3, sum2.For("PatientVitals").Unchanged);
        Assert.Equal(0, sum2.For("QueueItem").Created);
        Assert.Equal(2, sum2.For("QueueItem").Unchanged);

        // Staff edits both PatientVitals rows in v2, and v1 mutates PreAssessmentNote
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $"""
            UPDATE public."PatientVitals" SET "PreAssessmentNotes" = 'STAFF V2 EDIT A', "UpdatedBy" = 'clinic_staff' WHERE "Id" = '{v2PreOnlyId}';
            UPDATE public."PatientVitals" SET "PreAssessmentNotes" = 'STAFF V2 EDIT B', "UpdatedBy" = 'clinic_staff' WHERE "Id" = '{v2VitalMergedId}';
            """);
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."PreAssessmentNote" SET assessment = 'Second Note V1 Edit' WHERE id = 8602;
            UPDATE public."PreAssessmentNote" SET assessment = 'Merged PreAssess V1 Edit' WHERE id = 8603;
            """);

        // Run 3: v2-wins MUST preserve staff edits, keep UpdatedBy = 'clinic_staff', and emit V2_MODIFIED conflicts!
        var run3 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run3.Status);
        Assert.Equal("STAFF V2 EDIT A", await ScalarStringAsync(v2, $"""SELECT "PreAssessmentNotes" FROM public."PatientVitals" WHERE "Id" = '{v2PreOnlyId}' """));
        Assert.Equal("clinic_staff", await ScalarStringAsync(v2, $"""SELECT "UpdatedBy" FROM public."PatientVitals" WHERE "Id" = '{v2PreOnlyId}' """));
        Assert.Equal("STAFF V2 EDIT B", await ScalarStringAsync(v2, $"""SELECT "PreAssessmentNotes" FROM public."PatientVitals" WHERE "Id" = '{v2VitalMergedId}' """));
        Assert.Equal("clinic_staff", await ScalarStringAsync(v2, $"""SELECT "UpdatedBy" FROM public."PatientVitals" WHERE "Id" = '{v2VitalMergedId}' """));

        var (conflicts, _) = await fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, 50, 0);
        Assert.Contains(conflicts, c => c.EntityType == "PatientVitals" && c.V1Id == "preassess:8601" && c.ConflictType == SyncConflictType.V2Modified);
        Assert.Contains(conflicts, c => c.EntityType == "PatientVitals" && c.V1Id == "preassess:8603" && c.ConflictType == SyncConflictType.V2Modified);

        // FORCE_V1 on merged preassess:8603 restores v1 text cleanly
        var mergedConflict = conflicts.First(c => c.EntityType == "PatientVitals" && c.V1Id == "preassess:8603");
        var forceMerged = await fx.Coordinator.ResolveConflictAsync(mergedConflict.Id, "FORCE_V1", "test", CancellationToken.None);
        Assert.NotNull(forceMerged);
        Assert.Equal(SyncConflictStatus.ResolvedForceV1, forceMerged!.Conflict.Status);
        Assert.Equal("Merged PreAssess V1 Edit", await ScalarStringAsync(v2, $"""SELECT "PreAssessmentNotes" FROM public."PatientVitals" WHERE "Id" = '{v2VitalMergedId}' """));
    }

    [Fact]
    public async Task ForceV1_OnLabOrderItemConflict_Succeeds()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding = await CreateClinicBindingAsync(fx, "Track1 LabOrderItem ForceV1 Test");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."ClinicLaboratoryProcedure" (id, name, category, "rvsCode") VALUES (1, 'CBC V1', 'Hematology', 'CBC-1');
            INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "isActive")
            VALUES (7501, 'Synth', 'LabItemPat', 'MALE', '09170007501', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (8701, 101, 7501);
            INSERT INTO public."ClinicLaboratoryRequest" (id, "clinicId", "clinicPatientId", "serialNumber", impression)
            VALUES (8701, 101, 8701, 'LAB-8701', 'Baseline');
            INSERT INTO public."ClinicLaboratoryRequestProcedure" (id, "clinicLaboratoryRequestId", "clinicLaboratoryProcedureId")
            VALUES (8701, 8701, 1);
            """);

        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        var v2ItemId = DeterministicUuid.SharedLabOrderItemId(V2ClinicId, "lab", 8701);
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $"""
            UPDATE public."LabOrderItems" SET "TestName" = 'Staff Edited CBC', "UpdatedBy" = 'clinic_staff' WHERE "Id" = '{v2ItemId}';
            """);
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."ClinicLaboratoryProcedure" SET name = 'CBC V1 Updated' WHERE id = 1;
            """);

        var run2 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run2.Status);

        var (conflicts, _) = await fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, 50, 0);
        var itemConflict = Assert.Single(conflicts, c => c.EntityType == "LabOrderItem" && c.V1Id == "lab:8701" && c.ConflictType == SyncConflictType.V2Modified);

        var res = await fx.Coordinator.ResolveConflictAsync(itemConflict.Id, "FORCE_V1", "test", CancellationToken.None);
        Assert.NotNull(res);
        Assert.Equal(SyncConflictStatus.ResolvedForceV1, res!.Conflict.Status);
        Assert.Equal(SyncRunStatus.Completed, res.Run!.Status);

        await using var v2 = new NpgsqlConnection(fx.ClinicConnectionString);
        await v2.OpenAsync();
        Assert.Equal("CBC V1 Updated", await ScalarStringAsync(v2, $"""SELECT "TestName" FROM public."LabOrderItems" WHERE "Id" = '{v2ItemId}' """));
    }

    [Fact]
    public async Task MultiDrugMedication_MaintainsStableIdentityWhenFirstDrugDeleted()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding = await CreateClinicBindingAsync(fx, "Track1 MultiDrug HomeMed Identity Test");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."Drug" (id, "genericName", "brandName") VALUES
                (701, 'DrugA', 'BrandA'),
                (702, 'DrugB', 'BrandB');
            INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "isActive")
            VALUES (7601, 'Synth', 'HomeMedPat', 'FEMALE', '09170007601', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (8801, 101, 7601);
            INSERT INTO public."Medication" (id, "clinicId", "patientId", name) VALUES (71, 101, 7601, 'Multi-Drug Rx');
            INSERT INTO public."MedicationDrug" (id, "medicationId", "drugId", dosage) VALUES
                (701, 71, 701, '10mg'),
                (702, 71, 702, '20mg');
            """);

        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        var id701 = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{V2ClinicId:D}:v1_homemed:71:701");
        var id702 = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{V2ClinicId:D}:v1_homemed:71:702");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            DELETE FROM public."MedicationDrug" WHERE id = 701;
            """);

        var incRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, incRun.Status);

        await using var v2 = new NpgsqlConnection(fx.ClinicConnectionString);
        await v2.OpenAsync();
        Assert.Equal(2L, await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientHomeMedications" """));
        Assert.Equal("DrugA", await ScalarStringAsync(v2, $"""SELECT "GenericDrugName" FROM public."PatientHomeMedications" WHERE "Id" = '{id701}' """));
        Assert.Equal("DrugB", await ScalarStringAsync(v2, $"""SELECT "GenericDrugName" FROM public."PatientHomeMedications" WHERE "Id" = '{id702}' """));

        var (conflicts, _) = await fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, 50, 0);
        Assert.Contains(conflicts, c => c.EntityType == "PatientHomeMedication" && c.V1Id == "71:701" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
    }

    [Fact]
    public async Task SoftDeletedOrInactiveFolder_ExcludedAndShielded_AndFolderPrivacyCdcWorks()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding = await CreateClinicBindingAsync(fx, "Track1 Deleted Folder & FolderSetting CDC Test");

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            INSERT INTO public."FileType" (id, name) VALUES (1, 'Laboratory Result');
            INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "isActive")
            VALUES (7701, 'Synth', 'FolderPat', 'MALE', '09170007701', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (8901, 101, 7701);

            -- Folder 8901: Active CLINIC folder -> File 8901 synced (later FolderSetting.privacy -> PRIVATE)
            INSERT INTO public."Folder" (id, "userId", "isActive", "deletedAt") VALUES (8901, 7701, true, NULL);
            INSERT INTO public."FolderSetting" (id, "folderId", privacy, "scopeClinicId") VALUES (8901, 8901, 'CLINIC', 101);
            INSERT INTO public."File" (id, "folderId", "fileTypeId", name, size, url, "mimeType")
            VALUES (8901, 8901, 1, 'ActiveFolderFile.pdf', 100, 'https://storage.example.test/files/active8901.pdf', 'application/pdf');
            INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId") VALUES (8901, 8901, 'CLINIC', 101);

            -- Folder 8904: Active CLINIC folder -> File 8904 synced (later Folder soft-deleted in CDC)
            INSERT INTO public."Folder" (id, "userId", "isActive", "deletedAt") VALUES (8904, 7701, true, NULL);
            INSERT INTO public."FolderSetting" (id, "folderId", privacy, "scopeClinicId") VALUES (8904, 8904, 'CLINIC', 101);
            INSERT INTO public."File" (id, "folderId", "fileTypeId", name, size, url, "mimeType")
            VALUES (8904, 8904, 1, 'WillDeleteFolderFile.pdf', 100, 'https://storage.example.test/files/active8904.pdf', 'application/pdf');
            INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId") VALUES (8904, 8904, 'CLINIC', 101);

            -- Folder 8902: Soft-deleted folder -> File 8902 excluded
            INSERT INTO public."Folder" (id, "userId", "isActive", "deletedAt") VALUES (8902, 7701, true, now());
            INSERT INTO public."FolderSetting" (id, "folderId", privacy, "scopeClinicId") VALUES (8902, 8902, 'CLINIC', 101);
            INSERT INTO public."File" (id, "folderId", "fileTypeId", name, size, url, "mimeType")
            VALUES (8902, 8902, 1, 'DeletedFolderFile.pdf', 100, 'https://storage.example.test/files/del8902.pdf', 'application/pdf');
            INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId") VALUES (8902, 8902, 'CLINIC', 101);

            -- Folder 8903: Inactive folder -> File 8903 excluded
            INSERT INTO public."Folder" (id, "userId", "isActive", "deletedAt") VALUES (8903, 7701, false, NULL);
            INSERT INTO public."FolderSetting" (id, "folderId", privacy, "scopeClinicId") VALUES (8903, 8903, 'CLINIC', 101);
            INSERT INTO public."File" (id, "folderId", "fileTypeId", name, size, url, "mimeType")
            VALUES (8903, 8903, 1, 'InactiveFolderFile.pdf', 100, 'https://storage.example.test/files/inact8903.pdf', 'application/pdf');
            INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId") VALUES (8903, 8903, 'CLINIC', 101);
            """);

        var run1 = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, run1.Status);

        await using var v2 = new NpgsqlConnection(fx.ClinicConnectionString);
        await v2.OpenAsync();
        Assert.Equal(2L, await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."RecordAttachments" """));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."RecordAttachments" WHERE "Id" = '{DeterministicUuid.ClinicAttachmentFromFileId(V2ClinicId, 8901)}' """));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."RecordAttachments" WHERE "Id" = '{DeterministicUuid.ClinicAttachmentFromFileId(V2ClinicId, 8904)}' """));

        var parity1 = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        var attCheck = Assert.Single(parity1.Checks, c => c.EntityType == "RecordAttachments");
        Assert.Equal(2L, attCheck.V1ExpectedCount);
        Assert.Equal(2L, attCheck.V2ActualCount);
        Assert.True(attCheck.IsMatched);

        // Toggle FolderSetting 8901 to PRIVATE AND soft-delete Folder 8904 in CDC -> both files MUST be shielded & preserved in v2!
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."FolderSetting" SET privacy = 'PRIVATE' WHERE id = 8901;
            UPDATE public."Folder" SET "deletedAt" = now() WHERE id = 8904;
            """);

        var incRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, incRun.Status);

        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."RecordAttachments" WHERE "Id" = '{DeterministicUuid.ClinicAttachmentFromFileId(V2ClinicId, 8901)}' AND "IsDeleted" = false"""));
        Assert.Equal(1L, await ScalarInt64Async(v2, $"""SELECT COUNT(*) FROM public."RecordAttachments" WHERE "Id" = '{DeterministicUuid.ClinicAttachmentFromFileId(V2ClinicId, 8904)}' AND "IsDeleted" = false"""));
        var (conflicts, _) = await fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, 50, 0);
        Assert.Contains(conflicts, c => c.EntityType == "RecordAttachment" && c.V1Id == "file:8901" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
        Assert.Contains(conflicts, c => c.EntityType == "RecordAttachment" && c.V1Id == "file:8904" && c.ConflictType == SyncConflictType.V1SoftDeletedShielded);
    }

    [Fact]
    public async Task ModernPatientImmunizationSchema_WithoutLegacyUserVaccination_SyncsAndReconcilesParity()
    {
        await using var fx = await CreateInitializedTrack1FixtureAsync();
        var binding = await CreateClinicBindingAsync(fx, "Track1 Modern PatientImmunization");

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

            INSERT INTO public."User" (id, "firstName", "lastName", dob, gender, mobile, email, "isActive")
            VALUES (9101, 'Imm', 'Patient', '1995-04-12', 'FEMALE', '09170009101', 'imm9101@example.test', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES (9101, 101, 9101);
            INSERT INTO public."PhilHealthImmunizationLibrary" (id, category, code, name, "defaultDoseLabel", "defaultRoute")
            VALUES (7, 'ELDERLY', 'FLU-25', 'Influenza Vaccine', 'Annual', 'IM');
            INSERT INTO public."PatientImmunization" (id, "userId", "immunizationLibId", category, "vaccineName", "doseNumber", route, "dateGiven", "administeredBy", notes)
            VALUES
                (601, 9101, NULL, 'CHILD', 'Hepatitis B', 'Dose 1', 'IM', '2025-02-01 09:00:00', 'Nurse Ana', 'Left arm'),
                (602, 9101, 7, 'ELDERLY', '', NULL, NULL, '2025-03-15 10:00:00', 'Dr. Cruz', 'Clinic drive');
            """);

        var dryRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.DryRun, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, dryRun.Status);

        var backfill = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, backfill.Status);

        await using var v2 = new NpgsqlConnection(fx.ClinicConnectionString);
        await v2.OpenAsync();
        Assert.Equal(2L, await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientImmunizations" WHERE "IsDeleted" = false"""));
        Assert.Equal("Influenza Vaccine", await ScalarStringAsync(v2, """SELECT "VaccineName" FROM public."PatientImmunizations" WHERE "AdministeredByStaffName" = 'Dr. Cruz'"""));
        Assert.Equal("IM", await ScalarStringAsync(v2, """SELECT "Route" FROM public."PatientImmunizations" WHERE "AdministeredByStaffName" = 'Dr. Cruz'"""));

        var parity = await fx.Coordinator.GetParityReportAsync(binding.Id, CancellationToken.None);
        var immCheck = Assert.Single(parity.Checks, c => c.EntityType == "PatientImmunizations");
        Assert.Equal(2L, immCheck.V1ExpectedCount);
        Assert.Equal(2L, immCheck.V2ActualCount);
        Assert.True(immCheck.IsMatched);

        // Also verify clean skip when neither UserVaccination nor PatientImmunization exists
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """DROP TABLE IF EXISTS public."PatientImmunization" CASCADE;""");
        var noTableDryRun = await fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.DryRun, null, false, "test", CancellationToken.None);
        Assert.Equal(SyncRunStatus.Completed, noTableDryRun.Status);
    }

    private static async Task<Pg17TestFixture> CreateInitializedTrack1FixtureAsync()
    {
        var fx = new Pg17TestFixture();
        await fx.InitializeAsync();
        await InstallExtendedTrack1SchemasAsync(fx);
        return fx;
    }

    private static async Task<SyncBinding> CreateClinicBindingAsync(
        Pg17TestFixture fx,
        string name,
        int? v1ClinicId = V1ClinicId,
        int? v1OrgId = V1OrgId,
        Guid? v2ClinicId = null)
    {
        var effectiveV2ClinicId = v2ClinicId ?? V2ClinicId;
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $"""
            INSERT INTO public."Settings" ("Id","TenantId","TenantSlug","FacilitySlug","ClinicId","ClinicName")
            VALUES ('{Guid.NewGuid()}','{V2TenantId}','test-org','test-clinic','{effectiveV2ClinicId}','Test Clinic');
            """);

        return await fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track1Clinic, name, v1ClinicId, v1OrgId, V2TenantId, effectiveV2ClinicId),
            "test-harness");
    }

    internal static async Task InstallExtendedTrack1SchemasAsync(Pg17TestFixture fx)
    {
        // 1. Extend V1 schema with all Track 1 columns & tables BEFORE attaching CDC triggers
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            ALTER TABLE public."UserPreference"
                ADD COLUMN IF NOT EXISTS "patientPrimaryCareProvider" TEXT,
                ADD COLUMN IF NOT EXISTS "preferredTimeSlot" TEXT;
            ALTER TABLE public."PhilHealthRecord"
                ADD COLUMN IF NOT EXISTS "memberType" TEXT,
                ADD COLUMN IF NOT EXISTS "principalMemberPin" TEXT,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."PhilHealthDependent"
                ADD COLUMN IF NOT EXISTS "firstName" TEXT,
                ADD COLUMN IF NOT EXISTS "lastName" TEXT,
                ADD COLUMN IF NOT EXISTS relationship TEXT,
                ADD COLUMN IF NOT EXISTS gender TEXT,
                ADD COLUMN IF NOT EXISTS "isPermanentlyDisabled" BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS citizenship TEXT,
                ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
            ALTER TABLE public."UserAddress"
                ADD COLUMN IF NOT EXISTS "zipCode" TEXT,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."UserEmergencyContact"
                ADD COLUMN IF NOT EXISTS address TEXT,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();

            CREATE TABLE IF NOT EXISTS public."System" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."FileType" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."AppointmentMode" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."AppointmentType" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."Service" (id SERIAL PRIMARY KEY, name TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "deletedAt" TIMESTAMPTZ);
            CREATE TABLE IF NOT EXISTS public."ClinicOrganization" (id SERIAL PRIMARY KEY, "clinicId" INT NOT NULL, "organizationId" INT NOT NULL);

            CREATE TABLE IF NOT EXISTS public."HealthcareProvider" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."HPProfile" (id SERIAL PRIMARY KEY, "healthcareProviderId" INT NOT NULL, title TEXT, name TEXT, suffix TEXT);
            CREATE TABLE IF NOT EXISTS public."ProfessionalDetails" (id SERIAL PRIMARY KEY, "healthcareProverId" INT NOT NULL, "licenseNumber" TEXT, "ptrNumber" TEXT);

            CREATE TABLE IF NOT EXISTS public."Allergen" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."UserAllergy" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "allergenId" INT, reaction TEXT, notes TEXT);
            CREATE TABLE IF NOT EXISTS public."HealthCondition" (id SERIAL PRIMARY KEY, name TEXT NOT NULL, code TEXT);
            CREATE TABLE IF NOT EXISTS public."UserHealthCondition" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "healthConditionId" INT, status TEXT, severity TEXT, "dateDiagnosed" TIMESTAMPTZ, "dateResolved" TIMESTAMPTZ, notes TEXT, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "deletedAt" TIMESTAMPTZ);
            CREATE TABLE IF NOT EXISTS public."MedicalHistory" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "conditionId" INT, details TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "deletedAt" TIMESTAMPTZ);
            CREATE TABLE IF NOT EXISTS public."Disability" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."UserDisability" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "disabilityId" INT, severity TEXT, "dateDiagnosed" TIMESTAMPTZ, notes TEXT, reason TEXT, "deletedAt" TIMESTAMPTZ);
            CREATE TABLE IF NOT EXISTS public."FamilyMedicalHistory" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "conditionId" INT, details TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "deletedAt" TIMESTAMPTZ);
            CREATE TABLE IF NOT EXISTS public."PersonalHistory" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "smokingStatus" TEXT, "numberOfPacksPerYear" INT, "alcoholStatus" TEXT, "numberOfBottlesPerDay" INT, "illicitDrugUse" TEXT, "sexuallyActive" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "deletedAt" TIMESTAMPTZ);
            CREATE TABLE IF NOT EXISTS public."ObGyneHistory" (
                id SERIAL PRIMARY KEY, "userId" INT NOT NULL, menarche INT, "lastMenstrualPeriod" DATE, "menopauseAge" INT, "menopauseStatus" TEXT,
                "ageAtFirstSexualIntercourse" INT, "birthControlMethod" TEXT, "menstrualPeriodDuration" INT, "menstrualCycleInterval" INT, "numberOfPadsPerDay" INT,
                gravidity INT, parity INT, "fullTerm" INT, premature INT, abortion INT, "livingChildren" INT, "typeOfDelivery" TEXT,
                "hasPreEclampsia" BOOLEAN NOT NULL DEFAULT FALSE, "isFamilyPlanning" BOOLEAN NOT NULL DEFAULT FALSE,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "deletedAt" TIMESTAMPTZ
            );
            CREATE TABLE IF NOT EXISTS public."SurgicalHistory" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "operationName" TEXT, "operationDate" DATE, notes TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "deletedAt" TIMESTAMPTZ);
            CREATE TABLE IF NOT EXISTS public."Vaccine" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."Dose" (id SERIAL PRIMARY KEY, dose TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."Route" (id SERIAL PRIMARY KEY, route TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."UserVaccination" (id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "vaccineId" INT, "doseId" INT, "routeId" INT, "dateGiven" TIMESTAMPTZ, "administeredBy" TEXT, notes TEXT, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "deletedAt" TIMESTAMPTZ);
            CREATE TABLE IF NOT EXISTS public."PatientInsight" (id SERIAL PRIMARY KEY, "patientId" INT NOT NULL, "clinicId" INT NOT NULL, content TEXT, "validUntil" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now());

            ALTER TABLE public."Appointment"
                ADD COLUMN IF NOT EXISTS subject TEXT,
                ADD COLUMN IF NOT EXISTS complaint TEXT,
                ADD COLUMN IF NOT EXISTS "caseNumber" TEXT,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            CREATE TABLE IF NOT EXISTS public."AppointmentAttribute" (
                id SERIAL PRIMARY KEY, "appointmentId" INT NOT NULL, date DATE, "timeStart" TEXT, "maxDuration" INT, status TEXT,
                "systemId" INT, "isWalkIn" BOOLEAN NOT NULL DEFAULT FALSE, "completedAt" TIMESTAMPTZ, "receivedAt" TIMESTAMPTZ, "meetingUrl" TEXT,
                "modeId" INT, "typeId" INT, "serviceId" INT, "preferredAppointee" INT,
                "aiSymptomAnalysis" TEXT, "rejectedReason" TEXT, "rescheduledReason" TEXT, "dropReason" TEXT
            );
            ALTER TABLE public."AppointmentRouting"
                ADD COLUMN IF NOT EXISTS status TEXT,
                ADD COLUMN IF NOT EXISTS "routedTo" INT,
                ADD COLUMN IF NOT EXISTS amendment TEXT,
                ADD COLUMN IF NOT EXISTS "returnReason" TEXT;
            ALTER TABLE public."AppointmentTag" ADD COLUMN IF NOT EXISTS "healthcareProviderId" INT;
            CREATE TABLE IF NOT EXISTS public."AppointmentAttachment" (id SERIAL PRIMARY KEY, "appointmentId" INT NOT NULL, name TEXT, url TEXT);

            ALTER TABLE public."ConsultationTicket"
                ADD COLUMN IF NOT EXISTS "systemId" INT,
                ADD COLUMN IF NOT EXISTS subject TEXT,
                ADD COLUMN IF NOT EXISTS "caseNumber" TEXT,
                ADD COLUMN IF NOT EXISTS "konsultaAtc" TEXT,
                ADD COLUMN IF NOT EXISTS "konsultaAtcCode" TEXT,
                ADD COLUMN IF NOT EXISTS "konsultaHciCaseNo" TEXT,
                ADD COLUMN IF NOT EXISTS "soapTransNo" TEXT,
                ADD COLUMN IF NOT EXISTS "konsultaIsWalkedIn" BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS "isPhilHealthKonsulta" BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS "konsultaCoPay" NUMERIC(10,2),
                ADD COLUMN IF NOT EXISTS "konsultaAdvice" JSONB,
                ADD COLUMN IF NOT EXISTS "konsultaRecommendedDiagnosticOptions" JSONB,
                ADD COLUMN IF NOT EXISTS "ekasAuthorizationCode" TEXT,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            CREATE TABLE IF NOT EXISTS public."ConsultationTicketAttribute" (id SERIAL PRIMARY KEY, "consultationTicketId" INT NOT NULL, status TEXT);
            CREATE TABLE IF NOT EXISTS public."ConsultationTicketHP" (id SERIAL PRIMARY KEY, "consultationTicketId" INT NOT NULL, "hpId" INT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."ConsultationNote" (id SERIAL PRIMARY KEY, "consultationTicketId" INT NOT NULL, section TEXT NOT NULL, content TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."KonsultaManagementCode" (id SERIAL PRIMARY KEY, code TEXT NOT NULL, "sortOrder" INT NOT NULL DEFAULT 0);
            ALTER TABLE public."ConsultationManagement" ADD COLUMN IF NOT EXISTS "managementCodeId" INT;

            CREATE TABLE IF NOT EXISTS public."VitalSign" (
                id SERIAL PRIMARY KEY, "userId" INT NOT NULL, "consultationTicketId" INT, "dateTaken" TIMESTAMPTZ,
                height NUMERIC(12,4), weight NUMERIC(12,4), bmi NUMERIC(14,4), "bpSystolic" INT, "bpDiastolic" INT,
                "pulseRate" INT, temp NUMERIC(12,4), spo2 NUMERIC(12,4), "respRate" INT, notes TEXT,
                "headCircumference" NUMERIC(10,2), "hipCircumference" NUMERIC(10,2), length NUMERIC(10,2),
                "limbCircumference" NUMERIC(10,2), "midUpperArmCircumference" NUMERIC(10,2), "skinfoldThickness" NUMERIC(10,2),
                "visualAcuityLeft" TEXT, "visualAcuityRight" TEXT, "waistCircumference" NUMERIC(10,2),
                "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "deletedAt" TIMESTAMPTZ,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS public."PreAssessmentNote" (
                id SERIAL PRIMARY KEY, "clinicId" INT NOT NULL, "appointmentId" INT NOT NULL,
                assessment TEXT, "homeInstructions" TEXT, remarks TEXT,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            ALTER TABLE public."Prescription"
                ADD COLUMN IF NOT EXISTS "hpId" INT,
                ADD COLUMN IF NOT EXISTS "serialNumber" TEXT,
                ADD COLUMN IF NOT EXISTS remarks TEXT,
                ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;
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
            ALTER TABLE public."MedicineDispenseRecord"
                ADD COLUMN IF NOT EXISTS "isDispensed" BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS "dateDispensed" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "dispensingPersonnel" TEXT;
            CREATE TABLE IF NOT EXISTS public."MedicinePhilHealthData" (
                id SERIAL PRIMARY KEY, "medicineId" INT NOT NULL, "drugCode" TEXT, route TEXT,
                "actualUnitPrice" NUMERIC(12,2), "totalAmtPrice" NUMERIC(12,2), category TEXT
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
            ALTER TABLE public."ClinicImagingRequestProcedure"
                ADD COLUMN IF NOT EXISTS "clinicImagingProcedureId" INT,
                ADD COLUMN IF NOT EXISTS "bodyPart" TEXT,
                ADD COLUMN IF NOT EXISTS notes TEXT;

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

            CREATE TABLE IF NOT EXISTS public."MedicalCertificateReason" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."MedicalCertificateFinding" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."MedicalCertificateClassification" (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS public."ClinicMedicalCertificate" (
                id SERIAL PRIMARY KEY, "clinicId" INT NOT NULL, "clinicPatientId" INT NOT NULL, "consultationTicketId" INT, "hpId" INT,
                "serialNumber" TEXT, "reasonId" INT, "findingId" INT, "classificationId" INT, impression TEXT, remarks TEXT,
                "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "deletedAt" TIMESTAMPTZ,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            ALTER TABLE public."Folder"
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
            ALTER TABLE public."FolderSetting"
                ADD COLUMN IF NOT EXISTS privacy TEXT,
                ADD COLUMN IF NOT EXISTS "scopeClinicId" INT;

            CREATE TABLE IF NOT EXISTS public."PhysicalExamLibrary" (id TEXT PRIMARY KEY, category TEXT, code TEXT, description TEXT);
            ALTER TABLE public."PhysicalExamination"
                ADD COLUMN IF NOT EXISTS "dateTaken" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "generalSurveyId" TEXT, ADD COLUMN IF NOT EXISTS "generalSurveyRemarks" TEXT,
                ADD COLUMN IF NOT EXISTS "skinId" TEXT, ADD COLUMN IF NOT EXISTS "skinRemarks" TEXT,
                ADD COLUMN IF NOT EXISTS "heentId" TEXT, ADD COLUMN IF NOT EXISTS "heentRemarks" TEXT,
                ADD COLUMN IF NOT EXISTS "chestId" TEXT, ADD COLUMN IF NOT EXISTS "chestRemarks" TEXT,
                ADD COLUMN IF NOT EXISTS "heartId" TEXT, ADD COLUMN IF NOT EXISTS "heartRemarks" TEXT,
                ADD COLUMN IF NOT EXISTS "abdomenId" TEXT, ADD COLUMN IF NOT EXISTS "abdomenRemarks" TEXT,
                ADD COLUMN IF NOT EXISTS "neuroId" TEXT, ADD COLUMN IF NOT EXISTS "neuroRemarks" TEXT,
                ADD COLUMN IF NOT EXISTS "rectalId" TEXT, ADD COLUMN IF NOT EXISTS "rectalRemarks" TEXT,
                ADD COLUMN IF NOT EXISTS "guId" TEXT, ADD COLUMN IF NOT EXISTS "guRemarks" TEXT,
                ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();

            CREATE TABLE IF NOT EXISTS public."Drug" (id SERIAL PRIMARY KEY, "genericName" TEXT, "brandName" TEXT);
            ALTER TABLE public."Medication"
                ADD COLUMN IF NOT EXISTS "hpId" INT,
                ADD COLUMN IF NOT EXISTS name TEXT,
                ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."MedicationDrug"
                ADD COLUMN IF NOT EXISTS "drugId" INT,
                ADD COLUMN IF NOT EXISTS "isGeneric" BOOLEAN,
                ADD COLUMN IF NOT EXISTS dosage TEXT,
                ADD COLUMN IF NOT EXISTS frequency TEXT,
                ADD COLUMN IF NOT EXISTS unit TEXT,
                ADD COLUMN IF NOT EXISTS notes TEXT,
                ADD COLUMN IF NOT EXISTS duration INT;
            """);

        // Re-install CDC triggers now that all extended V1 tables exist
        var cdcSql = await File.ReadAllTextAsync(Path.Combine(Pg17TestFixture.SqlDirectory, "01_install_v1_sync_changelog.sql"));
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, cdcSql);

        // 2. Extend Clinic V2 schema with realistic EF Core MaxLength, NUMERIC precision, FOREIGN KEYs, and UNIQUE indexes
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, """
            ALTER TABLE public."Patients"
                ALTER COLUMN "PatientCode" TYPE VARCHAR(30),
                ALTER COLUMN "Occupation" TYPE VARCHAR(100);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_CustomFieldDefinitions_TenantId_ClinicId_EntityType_FieldKey"
                ON public."CustomFieldDefinitions" ("TenantId", "ClinicId", "EntityType", "FieldKey") WHERE "IsDeleted" = false;
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_Patients_TenantId_ClinicId_PatientCode"
                ON public."Patients" ("TenantId", "ClinicId", "PatientCode") WHERE "IsDeleted" = false;

            CREATE TABLE IF NOT EXISTS public."PatientAddresses" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "AddressType" VARCHAR(30) NOT NULL, "IsSameAsPermanent" BOOLEAN NOT NULL,
                "RegionName" VARCHAR(100), "ProvinceName" VARCHAR(100), "CityMunicipalityName" VARCHAR(100), "BarangayName" VARCHAR(100),
                "ZipCode" VARCHAR(10), "StreetAddress" VARCHAR(250) NOT NULL,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PatientAddresses_ClinicId_PatientId_AddressType"
                ON public."PatientAddresses" ("ClinicId", "PatientId", "AddressType") WHERE "IsDeleted" = false;

            CREATE TABLE IF NOT EXISTS public."PatientGuardians" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "LastName" VARCHAR(100) NOT NULL, "FirstName" VARCHAR(100) NOT NULL,
                "MiddleName" VARCHAR(100), "Suffix" VARCHAR(20), "ContactNumber" VARCHAR(30) NOT NULL,
                "RelationshipCode" VARCHAR(50) NOT NULL, "RelationshipOtherSpecify" VARCHAR(100),
                "IsPrimaryGuardian" BOOLEAN NOT NULL, "IsEmergencyContact" BOOLEAN NOT NULL,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."PatientAllergies" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "Category" VARCHAR(30) NOT NULL, "Allergen" VARCHAR(150) NOT NULL,
                "Severity" VARCHAR(30) NOT NULL, "ReactionManifestation" VARCHAR(250), "IsAnaphylactic" BOOLEAN NOT NULL DEFAULT FALSE, "Status" VARCHAR(30) NOT NULL,
                "Notes" VARCHAR(500), "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."PatientMedicalHistories" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "Category" VARCHAR(30) NOT NULL, "VerificationStatus" VARCHAR(30) NOT NULL,
                "ConditionTitle" VARCHAR(200) NOT NULL, "PhilHealthMdiseaseCode" VARCHAR(30), "Status" VARCHAR(30) NOT NULL, "Severity" VARCHAR(30) NOT NULL,
                "IsChronicNcd" BOOLEAN NOT NULL, "OnsetDate" DATE, "ResolvedDate" DATE, "IsOnDialysis" BOOLEAN NOT NULL, "ClinicalNotes" VARCHAR(500),
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."PatientFamilyHistories" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "ConditionTitle" VARCHAR(200) NOT NULL, "PhilHealthMdiseaseCode" VARCHAR(30),
                "Relationship" VARCHAR(30) NOT NULL, "ClinicalNotes" VARCHAR(500),
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."PatientSocialHistories" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "IsSmoker" BOOLEAN NOT NULL, "SmokingPackYears" NUMERIC(5,2), "SmokingStatus" VARCHAR(50),
                "IsAlcoholDrinker" BOOLEAN NOT NULL, "AlcoholBottlesPerDay" INT, "AlcoholStatus" VARCHAR(50),
                "UsesIllicitDrugs" BOOLEAN NOT NULL, "IsSexuallyActive" BOOLEAN NOT NULL, "IsPhysicallyActive" BOOLEAN NOT NULL, "UsesFluorideToothpaste" BOOLEAN NOT NULL,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PatientSocialHistories_PatientId" ON public."PatientSocialHistories" ("PatientId");

            CREATE TABLE IF NOT EXISTS public."PatientReproductiveHistories" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "IsApplicable" BOOLEAN NOT NULL, "MenarcheAge" INT, "LastMenstrualPeriod" DATE,
                "MenopauseAge" INT, "IsMenopausal" BOOLEAN NOT NULL, "CoitarcheAge" INT, "ContraceptiveMethod" VARCHAR(100),
                "PeriodDurationDays" INT, "CycleIntervalDays" INT, "PadsPerDay" INT, "IsCurrentlyPregnant" BOOLEAN NOT NULL,
                "Gravidity" INT NOT NULL, "Parity" INT NOT NULL, "TermBirths" INT NOT NULL, "PretermBirths" INT NOT NULL, "Abortions" INT NOT NULL, "LivingChildren" INT NOT NULL,
                "MiscarriagesCount" INT NOT NULL, "EctopicCount" INT NOT NULL, "StillbirthsCount" INT NOT NULL,
                "HadGestationalDiabetes" BOOLEAN NOT NULL, "HadPostpartumHemorrhage" BOOLEAN NOT NULL, "DeliveryType" VARCHAR(50),
                "HadPreEclampsiaHypertension" BOOLEAN NOT NULL, "ReceivedFamilyPlanningCounseling" BOOLEAN NOT NULL,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PatientReproductiveHistories_PatientId" ON public."PatientReproductiveHistories" ("PatientId");

            CREATE TABLE IF NOT EXISTS public."PatientSurgicalHistories" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "ProcedureName" VARCHAR(200) NOT NULL, "SurgeryDate" DATE, "Remarks" VARCHAR(500),
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."PatientImmunizations" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "PatientName" VARCHAR(150) NOT NULL, "VaccineName" VARCHAR(150) NOT NULL,
                "DoseSequence" INT NOT NULL, "IsSeriesCompleted" BOOLEAN NOT NULL, "Route" VARCHAR(50), "AdministeredAtUtc" TIMESTAMPTZ NOT NULL,
                "AdministeredByStaffName" VARCHAR(150), "HasAdverseReaction" BOOLEAN NOT NULL, "AdverseReactionSeverity" VARCHAR(30) NOT NULL,
                "IsHistorical" BOOLEAN NOT NULL, "Remarks" VARCHAR(500), "IsSynchronizedToPatientApp" BOOLEAN NOT NULL,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."PatientPhilHealthMemberships" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "MemberType" VARCHAR(10) NOT NULL, "DependentRelationship" VARCHAR(10),
                "MemberPin" VARCHAR(20) NOT NULL, "PrincipalMemberPin" VARCHAR(20),
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PatientPhilHealthMemberships_PatientId" ON public."PatientPhilHealthMemberships" ("PatientId");

            CREATE TABLE IF NOT EXISTS public."PatientAlerts" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "Category" VARCHAR(30) NOT NULL, "Title" VARCHAR(200) NOT NULL,
                "Severity" VARCHAR(30) NOT NULL, "Status" VARCHAR(30) NOT NULL, "ExpiresAt" TIMESTAMPTZ, "Notes" VARCHAR(1000),
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."QueueItems" (
                "Id" UUID PRIMARY KEY, "QueueNumber" VARCHAR(20) NOT NULL, "SequenceNumber" INT NOT NULL, "QueueDate" DATE NOT NULL,
                "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "PatientName" VARCHAR(150) NOT NULL, "AppointmentId" UUID, "Priority" VARCHAR(30) NOT NULL,
                "Status" VARCHAR(30) NOT NULL, "VisitWorkflowMode" VARCHAR(30) NOT NULL, "CheckInTime" TIMESTAMPTZ NOT NULL, "CompletedTime" TIMESTAMPTZ,
                "ChiefComplaint" VARCHAR(255), "VisitType" VARCHAR(50) NOT NULL, "IsDirectVisit" BOOLEAN NOT NULL,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."Appointments" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "PatientName" VARCHAR(150) NOT NULL, "DoctorId" UUID, "DoctorName" VARCHAR(200),
                "ScheduledAt" TIMESTAMPTZ NOT NULL, "DurationMinutes" INT NOT NULL, "EndTimeUtc" TIMESTAMPTZ NOT NULL,
                "Status" VARCHAR(30) NOT NULL, "VisitWorkflowMode" VARCHAR(30) NOT NULL, "ServiceType" VARCHAR(255), "Reason" VARCHAR(250), "Notes" TEXT,
                "ShareFieldsJson" TEXT NOT NULL, "AttachedFileIdsJson" TEXT NOT NULL, "SharedScopes" TEXT NOT NULL, "SharedItemsJson" TEXT NOT NULL,
                "Reminder24hSent" BOOLEAN NOT NULL, "Reminder2hSent" BOOLEAN NOT NULL, "AppointmentType" VARCHAR(30) NOT NULL,
                "PaymentPolicy" VARCHAR(30) NOT NULL, "PaymentStatus" VARCHAR(30) NOT NULL, "IsEmergencyOverride" BOOLEAN NOT NULL,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."Consultations" (
                "Id" UUID PRIMARY KEY, "QueueItemId" UUID, "AppointmentId" UUID, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "PatientName" VARCHAR(150) NOT NULL,
                "DoctorId" UUID NOT NULL, "DoctorName" VARCHAR(200) NOT NULL, "DoctorPrcLicense" VARCHAR(50), "DoctorPtr" VARCHAR(50),
                "EncounterDate" TIMESTAMPTZ NOT NULL, "Subjective" TEXT NOT NULL, "Objective" TEXT NOT NULL, "Assessment" TEXT NOT NULL, "Plan" TEXT NOT NULL,
                "IsSigned" BOOLEAN NOT NULL, "SignedAt" TIMESTAMPTZ, "VisitWorkflowMode" VARCHAR(30) NOT NULL, "IsYakapEligible" BOOLEAN NOT NULL,
                "PhilHealthCaseNo" VARCHAR(50), "PhilHealthSoapTransNo" VARCHAR(50), "PhilHealthAtc" VARCHAR(50), "IsWalkedIn" BOOLEAN NOT NULL,
                "ServiceDeliveryMethod" VARCHAR(30) NOT NULL, "RxDispenseStatus" VARCHAR(30) NOT NULL, "RxStage" VARCHAR(30) NOT NULL, "RosCategory" VARCHAR(100),
                "HasCoPayment" BOOLEAN NOT NULL DEFAULT FALSE, "CoPaymentAmount" NUMERIC(12,2), "HomeInstructions" TEXT,
                "DiagnosticServicesOption" VARCHAR(10), "OtherMedicalAdviceSpec" VARCHAR(500), "PhilHealthManagementCodes" TEXT,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_Consultations_QueueItemId" ON public."Consultations" ("QueueItemId") WHERE "QueueItemId" IS NOT NULL;

            CREATE TABLE IF NOT EXISTS public."PatientVitals" (
                "Id" UUID PRIMARY KEY, "QueueItemId" UUID, "ConsultationEncounterId" UUID, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "RecordedAt" TIMESTAMPTZ NOT NULL,
                "SystolicBp" INT, "DiastolicBp" INT, "HeartRateBpm" INT, "TemperatureCelsius" NUMERIC(5,2), "RespiratoryRateBreathsPerMin" INT,
                "OxygenSaturationPercent" NUMERIC(5,2), "HeightCm" NUMERIC(6,2), "WeightKg" NUMERIC(6,2), "Bmi" NUMERIC(5,2), "Notes" TEXT,
                "HeadCircumferenceCm" NUMERIC(6,2), "HipCircumferenceCm" NUMERIC(6,2), "BodyLengthCm" NUMERIC(6,2), "LimbsCircumferenceCm" NUMERIC(6,2),
                "MidUpperArmCircumferenceCm" NUMERIC(6,2), "SkinfoldThicknessMm" NUMERIC(6,2), "VisualAcuityLeft" VARCHAR(50), "VisualAcuityRight" VARCHAR(50),
                "WaistCircumferenceCm" NUMERIC(6,2), "IsMeasuredRecumbent" BOOLEAN NOT NULL, "RosCategory" VARCHAR(100),
                "PreAssessmentNotes" TEXT, "PreAssessmentRemarks" TEXT, "HomeInstructions" TEXT,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PatientVitals_QueueItemId" ON public."PatientVitals" ("QueueItemId") WHERE "QueueItemId" IS NOT NULL;

            CREATE TABLE IF NOT EXISTS public."Prescriptions" (
                "Id" UUID PRIMARY KEY, "ConsultationEncounterId" UUID NOT NULL REFERENCES public."Consultations"("Id") ON DELETE RESTRICT,
                "GenericName" VARCHAR(150) NOT NULL, "BrandName" VARCHAR(150), "Dosage" VARCHAR(50) NOT NULL, "Form" VARCHAR(50) NOT NULL,
                "Sig" VARCHAR(255) NOT NULL, "Quantity" INT NOT NULL, "DurationDays" INT, "Refills" INT NOT NULL DEFAULT 0, "DoseQuantity" INT NOT NULL DEFAULT 0,
                "IsDangerousDrug" BOOLEAN NOT NULL DEFAULT FALSE, "Remarks" TEXT, "PhilHealthDrugCode" VARCHAR(50),
                "Route" VARCHAR(50) NOT NULL, "DoseUnit" VARCHAR(50) NOT NULL, "Frequency" VARCHAR(50) NOT NULL,
                "UnitPrice" NUMERIC(12,2), "TotalCost" NUMERIC(12,2), "PhilHealthCategory" VARCHAR(50),
                "PrescriptionDate" DATE NOT NULL, "PrescribingPhysicianName" VARCHAR(200) NOT NULL, "PrescribingPhysicianPrcNo" VARCHAR(50),
                "IsDispensed" BOOLEAN NOT NULL, "DispensedQuantity" INT, "DispensedDate" DATE, "DispensingPersonnel" TEXT,
                "IsGamotCovered" BOOLEAN NOT NULL DEFAULT FALSE, "IsClinicDispensed" BOOLEAN NOT NULL, "ClinicDispensedAt" TIMESTAMPTZ, "ClinicDispensedBy" VARCHAR(150), "ClinicDispensedQuantity" INT,
                "RosCategory" VARCHAR(100),
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."ClinicDispensingLogs" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "PatientName" VARCHAR(150) NOT NULL, "QueueItemId" UUID NOT NULL,
                "Source" VARCHAR(50) NOT NULL, "ConsultationEncounterId" UUID, "PrescriptionItemId" UUID,
                "ItemName" VARCHAR(150) NOT NULL, "ItemCategory" VARCHAR(50) NOT NULL, "DosageOrSpec" VARCHAR(100), "FormOrUnit" VARCHAR(50),
                "QuantityDispensed" INT NOT NULL, "DirectionsOrInstructions" VARCHAR(255), "RosCategory" VARCHAR(100),
                "IsConsultationValidated" BOOLEAN NOT NULL, "DispensedByStaffName" VARCHAR(150) NOT NULL, "DispensedByRole" VARCHAR(50) NOT NULL,
                "DispensedAt" TIMESTAMPTZ NOT NULL, "RequiresDoctorReview" BOOLEAN NOT NULL, "InterventionFlagged" BOOLEAN NOT NULL,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."LabOrders" (
                "Id" UUID PRIMARY KEY, "OrderNumber" VARCHAR(50) NOT NULL, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "PatientName" VARCHAR(150) NOT NULL,
                "ConsultationId" UUID, "QueueItemId" UUID, "OrderedByDoctorName" VARCHAR(200) NOT NULL, "RequestingPhysicianName" VARCHAR(200),
                "RequestingPhysicianPrcNo" VARCHAR(50), "OrderDate" TIMESTAMPTZ NOT NULL, "Status" VARCHAR(30) NOT NULL,
                "ClinicalDiagnosis" TEXT, "Notes" TEXT, "Stage" VARCHAR(30) NOT NULL, "StageChangedAt" TIMESTAMPTZ,
                "PaymentRequired" BOOLEAN NOT NULL, "HasCriticalPanicAlert" BOOLEAN NOT NULL, "IsSigned" BOOLEAN NOT NULL,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_LabOrders_TenantId_ClinicId_OrderNumber"
                ON public."LabOrders" ("TenantId", "ClinicId", "OrderNumber") WHERE "IsDeleted" = false;

            CREATE TABLE IF NOT EXISTS public."LabOrderItems" (
                "Id" UUID PRIMARY KEY, "LabOrderId" UUID NOT NULL REFERENCES public."LabOrders"("Id") ON DELETE RESTRICT, "TestName" VARCHAR(150) NOT NULL, "Category" VARCHAR(50) NOT NULL,
                "Instructions" TEXT, "Status" VARCHAR(30) NOT NULL, "TestCode" VARCHAR(20),
                "IsPhysicianRecommended" BOOLEAN NOT NULL, "IsDoneOutsideFacility" BOOLEAN NOT NULL,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."MedicalCertificates" (
                "Id" UUID PRIMARY KEY, "CertificateNumber" VARCHAR(50) NOT NULL, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "PatientName" VARCHAR(150) NOT NULL,
                "ConsultationId" UUID, "QueueItemId" UUID, "DoctorId" UUID, "DoctorName" VARCHAR(200) NOT NULL,
                "PrcLicenseNumber" VARCHAR(50) NOT NULL, "PtrNumber" VARCHAR(50), "IssueDate" DATE NOT NULL,
                "Diagnosis" VARCHAR(1000) NOT NULL, "ClinicalFindings" TEXT, "FitnessStatus" VARCHAR(50) NOT NULL,
                "Purpose" VARCHAR(50) NOT NULL, "Remarks" TEXT, "IsSigned" BOOLEAN NOT NULL, "SignedAt" TIMESTAMPTZ, "SecurityDigest" TEXT,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_MedicalCertificates_TenantId_ClinicId_CertificateNumber"
                ON public."MedicalCertificates" ("TenantId", "ClinicId", "CertificateNumber") WHERE "IsDeleted" = false;

            CREATE TABLE IF NOT EXISTS public."RecordAttachments" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "RecordType" VARCHAR(50) NOT NULL, "Title" VARCHAR(200) NOT NULL,
                "FileName" VARCHAR(255) NOT NULL, "ContentType" VARCHAR(100) NOT NULL, "FileSizeBytes" BIGINT NOT NULL,
                "StorageUri" VARCHAR(2000) NOT NULL, "DocumentDate" DATE NOT NULL, "VerificationStatus" VARCHAR(30) NOT NULL, "EncryptionAlgorithm" VARCHAR(30) NOT NULL,
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."PatientPhysicalExams" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "ConsultationEncounterId" UUID, "ExamDate" TIMESTAMPTZ NOT NULL, "ExaminedByStaffName" VARCHAR(200),
                "GeneralSurveyStatus" VARCHAR(30) NOT NULL, "GeneralSurveyCodes" VARCHAR(100) NOT NULL, "GeneralSurveyRemarks" VARCHAR(1000),
                "SkinRemarks" VARCHAR(1000), "HeentRemarks" VARCHAR(1000), "ChestLungsRemarks" VARCHAR(1000), "HeartRemarks" VARCHAR(1000),
                "AbdomenRemarks" VARCHAR(1000), "NeurologicalRemarks" VARCHAR(1000), "DigitalRectalRemarks" VARCHAR(1000), "GenitourinaryRemarks" VARCHAR(1000),
                "GenSurveyId" VARCHAR(50), "SkinId" VARCHAR(50), "HeentId" VARCHAR(50), "ChestId" VARCHAR(50), "HeartId" VARCHAR(50),
                "AbdomenId" VARCHAR(50), "NeuroId" VARCHAR(50), "RectalId" VARCHAR(50), "GuId" VARCHAR(50),
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."PatientPhysicalExamFindings" (
                "Id" UUID PRIMARY KEY, "PhysicalExamId" UUID NOT NULL REFERENCES public."PatientPhysicalExams"("Id") ON DELETE RESTRICT, "System" VARCHAR(50) NOT NULL, "IsNormal" BOOLEAN NOT NULL,
                "FindingTitle" VARCHAR(255) NOT NULL, "PhilHealthFindingCode" VARCHAR(50), "Remarks" VARCHAR(1000),
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."PatientHomeMedications" (
                "Id" UUID PRIMARY KEY, "PatientId" UUID NOT NULL REFERENCES public."Patients"("Id") ON DELETE RESTRICT, "GenericDrugName" VARCHAR(200) NOT NULL, "BrandName" VARCHAR(200),
                "DoseStrength" VARCHAR(100), "Form" VARCHAR(50), "Frequency" VARCHAR(100), "Duration" VARCHAR(50),
                "IsPndfListed" BOOLEAN NOT NULL, "PrescribingPhysicianName" VARCHAR(200), "StartDate" DATE NOT NULL, "StoppedDate" DATE,
                "IsActive" BOOLEAN NOT NULL, "Indication" TEXT, "Source" VARCHAR(50),
                "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "CreatedBy" TEXT, "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" TEXT,
                "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE, "TenantId" TEXT NOT NULL, "ClinicId" UUID NOT NULL
            );
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
