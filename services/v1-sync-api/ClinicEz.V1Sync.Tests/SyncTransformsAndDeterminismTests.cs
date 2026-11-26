using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using ClinicEz.V1Sync.Api.Models;
using ClinicEz.V1Sync.Api.Services;
using FluentAssertions;
using Npgsql;
using Xunit;

namespace ClinicEz.V1Sync.Tests;

public sealed class SyncTransformsAndDeterminismTests
{
    [Fact]
    public void DeterministicUuid_ProducesStableVersion5GuidsAcrossCalls()
    {
        var clinicId = Guid.Parse("11111111-2222-3333-4444-555555555555");
        var p1 = DeterministicUuid.ClinicPatientId(clinicId, 1042);
        var p2 = DeterministicUuid.ClinicPatientId(clinicId, 1042);
        var other = DeterministicUuid.ClinicPatientId(clinicId, 1043);

        p1.Should().Be(p2);
        p1.Should().NotBe(other);
        // RFC 4122 version 5 nibble check
        p1.ToString("D")[14].Should().Be('5');

        // Shared clinical IDs match between Track 1 and Track 2
        var c1 = DeterministicUuid.SharedConsultationId(clinicId, 777);
        var c2 = DeterministicUuid.SharedConsultationId(clinicId, 777);
        c1.Should().Be(c2);
    }

    [Fact]
    public void GenerateClinicEzId_FollowsCrockfordBase32FormatAndIsDeterministic()
    {
        var id1 = DeterministicUuid.GenerateClinicEzId(12345);
        var id2 = DeterministicUuid.GenerateClinicEzId(12345);
        var id3 = DeterministicUuid.GenerateClinicEzId(12346);
        var salted = SyncTransforms.GenerateClinicEzId(12345, salt: 1);

        id1.Should().Be(id2);
        id1.Should().NotBe(id3);
        salted.Should().NotBe(id1);
        Regex.IsMatch(id1, "^CE-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$").Should().BeTrue();
        Regex.IsMatch(salted, "^CE-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$").Should().BeTrue();
    }

    [Theory]
    [InlineData("user_2abcXYZ123", "user_2abcXYZ123", false)]
    [InlineData("auth0|65a1b2c3d4e5f6", null, true)]
    [InlineData("", null, false)]
    [InlineData(null, null, false)]
    public void ExtractClerkUserId_DropsAuth0AndKeepsOnlyClerkIds(string? raw, string? expected, bool expectedLegacyAuth0)
    {
        SyncTransforms.ExtractClerkUserId(raw).Should().Be(expected);
        SyncTransforms.IsLegacyAuth0(raw).Should().Be(expectedLegacyAuth0);
    }

    [Theory]
    [InlineData("Cardio", "Cardiovascular")]
    [InlineData("Vascular", "Cardiovascular")]
    [InlineData("Respi", "Respiratory")]
    [InlineData("Derma", "Dermatologic")]
    [InlineData("Gastro", "Gastrointestinal")]
    [InlineData("Genitourinary", "Genitourinary")]
    [InlineData("Renal", "Genitourinary")]
    [InlineData("Reproductive", "Genitourinary")]
    [InlineData("Musculoskeletal", "Musculoskeletal")]
    [InlineData("Neuro", "Neurological")]
    [InlineData("Psychia", "PsychiatricNeurodevelopmental")]
    [InlineData("Endocrine/Metabolic", "EndocrineMetabolic")]
    [InlineData("Hema", "HematologicLymphatic")]
    [InlineData("Immuno", "AllergicImmunologic")]
    [InlineData("Optha", "Heent")]
    [InlineData("Otorhinolaryngo", "Heent")]
    [InlineData("Dental", "Heent")]
    [InlineData("Essentially Normal", "EssentiallyNormal")]
    [InlineData("Infectious", "General")]
    [InlineData("Neoplasm", "General")]
    [InlineData("Others", "General")]
    public void MapRosCategory_MapsAll22V1SystemsToExactPascalCaseRosSystem(string v1System, string expected)
    {
        SyncTransforms.MapRosCategory(v1System).Should().Be(expected);
    }

    [Theory]
    [InlineData("X-Ray", "11111111-1111-1111-1111-111111111111", "ImagingReport")]
    [InlineData("X-Ray Result", "11111111-1111-1111-1111-111111111111", "ImagingReport")]
    [InlineData("Echocardiography", "11111111-1111-1111-1111-111111111111", "ImagingReport")]
    [InlineData("ECG", "22222222-2222-2222-2222-222222222222", "ECGStrip")]
    [InlineData("Blood Chemistry", "22222222-2222-2222-2222-222222222222", "LabResult")]
    [InlineData("Urinalysis", "22222222-2222-2222-2222-222222222222", "LabResult")]
    [InlineData("Medical Certificate", "33333333-3333-3333-3333-333333333333", "MedicalCertificate")]
    [InlineData("Prescription", "44444444-4444-4444-4444-444444444444", "Other")]
    [InlineData("Referrals", "66666666-6666-6666-6666-666666666666", "ExternalReferral")]
    [InlineData("Vaccination Card", "66666666-6666-6666-6666-666666666666", "Other")]
    [InlineData("PWD ID", "55555555-5555-5555-5555-555555555555", "Other")]
    [InlineData("Personal Health Record", "66666666-6666-6666-6666-666666666666", "Other")]
    [InlineData("COVID-19 Vaccination Card", "66666666-6666-6666-6666-666666666666", "Other")]
    [InlineData("COVID-19 Vaccination Certificate", "66666666-6666-6666-6666-666666666666", "Other")]
    [InlineData("COVID-19 Test", "22222222-2222-2222-2222-222222222222", "LabResult")]
    public void FileTypeMapping_MapsToExactSeededDocumentTypeAndClinicRecordType(
        string v1FileType, string expectedDocTypeId, string expectedClinicRecordType)
    {
        SyncTransforms.MapPatientDocumentTypeId(v1FileType).Should().Be(Guid.Parse(expectedDocTypeId));
        SyncTransforms.MapClinicRecordAttachmentType(v1FileType).Should().Be(expectedClinicRecordType);
    }

    [Theory]
    [InlineData("Other", "thorax_marx_scan.pdf", "66666666-6666-6666-6666-666666666666")]
    [InlineData("Other", "rx_order.pdf", "44444444-4444-4444-4444-444444444444")]
    [InlineData("Other", "order_rx.pdf", "44444444-4444-4444-4444-444444444444")]
    [InlineData("Other", "rx-123.pdf", "44444444-4444-4444-4444-444444444444")]
    [InlineData("Other", "RX.pdf", "44444444-4444-4444-4444-444444444444")]
    public void MapPatientDocumentTypeId_FilenameFallback_UsesRxWordBoundary(
        string v1FileType, string fileName, string expectedDocTypeId)
    {
        SyncTransforms.MapPatientDocumentTypeId(v1FileType, fileName).Should().Be(Guid.Parse(expectedDocTypeId));
    }

    [Theory]
    [InlineData("CLASS A", "FitToWork")]
    [InlineData("CLASS B", "FitToWork")]
    [InlineData("N/A", "FitToWork")]
    [InlineData("Fit to Work Clearance", "FitToWork")]
    [InlineData("Fit for Work Clearance", "FitToWork")]
    [InlineData("CLASS C", "FitWithRestrictions")]
    [InlineData("Fit with restrictions", "FitWithRestrictions")]
    [InlineData("With Restrictions", "FitWithRestrictions")]
    [InlineData("Pending Clearance", "FitWithRestrictions")]
    [InlineData("Conditional Clearance", "FitWithRestrictions")]
    [InlineData("Fit to Work (Conditional)", "FitWithRestrictions")]
    [InlineData("Conditional", "FitWithRestrictions")]
    [InlineData("Fit to Work with Limitations", "FitWithRestrictions")]
    [InlineData("Fit to Work with Restrictions", "FitWithRestrictions")]
    [InlineData("CLASS D", "UnfitToWork")]
    [InlineData("Unfit", "UnfitToWork")]
    [InlineData("Not Fit", "UnfitToWork")]
    [InlineData("Unfit to Work Clearance", "UnfitToWork")]
    [InlineData("Light Duty", "LightDuty")]
    [InlineData("Fit to School", "FitToSchool")]
    public void MapFitnessStatus_MapsAllV1ClassificationsToCanonicalV2Values(string? v1Class, string expected)
    {
        SyncTransforms.MapFitnessStatus(v1Class).Should().Be(expected);
    }

    [Theory]
    [InlineData(null, null, false)]
    [InlineData("", null, false)]
    [InlineData("NEVER", "NeverSmoked", false)]
    [InlineData("No", "NeverSmoked", false)]
    [InlineData("NOT_APPLICABLE", "NeverSmoked", false)]
    [InlineData("FORMER", "FormerSmoker", false)]
    [InlineData("FORMER_SMOKER", "FormerSmoker", false)]
    [InlineData("Quit", "FormerSmoker", false)]
    [InlineData("CURRENT", "CurrentSmoker", true)]
    [InlineData("CURRENT_SMOKER", "CurrentSmoker", true)]
    [InlineData("REGULAR", "CurrentSmoker", true)]
    [InlineData("OCCASIONAL", "CurrentSmoker", true)]
    [InlineData("Yes", "CurrentSmoker", true)]
    [InlineData("TRUE", "CurrentSmoker", true)]
    [InlineData("ACTIVE", "CurrentSmoker", true)]
    public void SmokingStatusMappers_MapV1ValuesToCanonicalPatientEnumAndClinicBool(
        string? raw, string? expectedPatientEnum, bool expectedClinicActive)
    {
        var patientStatus = SyncTransforms.MapPatientSmokingStatus(raw);
        var clinicActive = SyncTransforms.IsActiveSmoker(raw);

        patientStatus.Should().Be(expectedPatientEnum);
        clinicActive.Should().Be(expectedClinicActive);
        clinicActive.Should().Be(patientStatus == "CurrentSmoker");
    }

    [Theory]
    [InlineData(null, null, false)]
    [InlineData("   ", null, false)]
    [InlineData("NEVER", "Never", false)]
    [InlineData("No", "Never", false)]
    [InlineData("NOT_APPLICABLE", "Never", false)]
    [InlineData("FORMER", "Never", false)]
    [InlineData("Quit", "Never", false)]
    [InlineData("OCCASIONAL", "Occasional", true)]
    [InlineData("OCCASIONAL_DRINKER", "Occasional", true)]
    [InlineData("TRUE", "Occasional", true)]
    [InlineData("ACTIVE", "Occasional", true)]
    [InlineData("Yes", "Moderate", true)]
    [InlineData("REGULAR", "Moderate", true)]
    [InlineData("MODERATE_DRINKER", "Moderate", true)]
    [InlineData("HEAVY", "Heavy", true)]
    [InlineData("HEAVY_DRINKER", "Heavy", true)]
    [InlineData("CHRONIC", "Heavy", true)]
    public void AlcoholUseMappers_MapV1ValuesToCanonicalPatientEnumAndClinicBool(
        string? raw, string? expectedPatientEnum, bool expectedClinicActive)
    {
        var patientUse = SyncTransforms.MapPatientAlcoholUse(raw);
        var clinicActive = SyncTransforms.IsActiveAlcoholDrinker(raw);

        patientUse.Should().Be(expectedPatientEnum);
        clinicActive.Should().Be(expectedClinicActive);
        clinicActive.Should().Be(patientUse is "Occasional" or "Moderate" or "Heavy");
    }

    [Fact]
    public void VitalsNumericSanitizers_FilterOutOfRangeValuesAndPreserveValidOnes()
    {
        SyncTransforms.SanitizeBmi(null).Should().BeNull();
        SyncTransforms.SanitizeBmi(0m).Should().BeNull();
        SyncTransforms.SanitizeBmi(259106.8435m).Should().BeNull();
        SyncTransforms.SanitizeBmi(999.999m).Should().BeNull();
        SyncTransforms.SanitizeBmi(999.99m).Should().Be(999.99m);
        SyncTransforms.SanitizeBmi(22.5m).Should().Be(22.5m);

        SyncTransforms.SanitizeTemperatureCelsius(null).Should().BeNull();
        SyncTransforms.SanitizeTemperatureCelsius(736m).Should().BeNull();
        SyncTransforms.SanitizeTemperatureCelsius(-2m).Should().BeNull();
        SyncTransforms.SanitizeTemperatureCelsius(36.8m).Should().Be(36.8m);

        SyncTransforms.SanitizeOxygenSaturationPercent(null).Should().BeNull();
        SyncTransforms.SanitizeOxygenSaturationPercent(989m).Should().BeNull();
        SyncTransforms.SanitizeOxygenSaturationPercent(-1m).Should().BeNull();
        SyncTransforms.SanitizeOxygenSaturationPercent(98.5m).Should().Be(98.5m);
        SyncTransforms.SanitizeOxygenSaturationPercent(100m).Should().Be(100m);
    }

    [Fact]
    public void SanitizeErrorMessage_NeverLeaksPhiFromExceptionsOrRawStrings()
    {
        const string syntheticPhi = "patient.secret.name@example.com";
        var pgEx = new PostgresException(
            messageText: $"23505: duplicate key value for {syntheticPhi}",
            severity: "ERROR",
            invariantSeverity: "ERROR",
            sqlState: "23505",
            detail: $"Key (email)=({syntheticPhi}) already exists.",
            constraintName: "uq_patients_email");

        var sanitizedPg = SyncTransforms.SanitizeErrorMessage(pgEx);
        sanitizedPg.Should().Be("PostgresException (SqlState=23505, Constraint=uq_patients_email)");
        sanitizedPg.Should().NotContain(syntheticPhi);

        var opEx = new InvalidOperationException($"Failed processing {syntheticPhi}");
        var sanitizedOp = SyncTransforms.SanitizeErrorMessage(opEx);
        sanitizedOp.Should().Be("InvalidOperationException");
        sanitizedOp.Should().NotContain(syntheticPhi);

        var sanitizedRaw = SyncTransforms.SanitizeErrorMessage($"22003: numeric field overflow for {syntheticPhi}");
        sanitizedRaw.Should().Be("DatabaseError (SqlState=22003)");
        sanitizedRaw.Should().NotContain(syntheticPhi);
    }

    [Fact]
    public void BuildClinicPatientCustomFields_PreservesDedicatedDynamicFieldsWithoutCramming()
    {
        var cf = SyncTransforms.BuildClinicPatientCustomFields(
            affiliation: "Student",
            studentId: "2024301234",
            lrn: "123456789012",
            studentLevel: "Undergraduate",
            collegeName: "CITC",
            programName: "BS Information Technology",
            yearLevel: "3",
            employeeId: null,
            departmentName: null,
            officeName: "OSA",
            position: "Student Assistant",
            designation: "Tech Lead",
            placeOfBirth: "Cagayan de Oro City",
            legacyCaseNumber: "USTP-2025-001",
            tin: "123-456-789",
            philSysId: "1234-5678-9012-3456",
            addressLine: "CM Recto Ave",
            barangay: "Lapasan",
            city: "Cagayan de Oro",
            province: "Misamis Oriental",
            emergencyContactName: "Parent Name",
            emergencyContactPhone: "09171234567",
            emergencyContactRelationship: "Mother",
            v1AccountType: "PATIENT",
            v1OnboardingStatus: "COMPLETED",
            v1Nickname: "Juju");

        cf["student_id"].Should().Be("2024301234");
        cf["lrn"].Should().Be("123456789012");
        cf["student_level"].Should().Be("Undergraduate");
        cf["year_level"].Should().Be("3rd Year");
        cf["office"].Should().Be("OSA");
        cf["position"].Should().Be("Student Assistant");
        cf["designation"].Should().Be("Tech Lead");
        cf["place_of_birth"].Should().Be("Cagayan de Oro City");
        cf["legacy_case_number"].Should().Be("USTP-2025-001");
        cf["tin"].Should().Be("123-456-789");
        cf["philsys_id"].Should().Be("1234-5678-9012-3456");

        // Canonical intake fallback keys aligned with ClinicCustomFieldTemplatesCatalog.CanonicalIntakeFallbackKeys
        cf["primary_address_line"].Should().Be("CM Recto Ave");
        cf["primary_barangay"].Should().Be("Lapasan");
        cf["primary_city"].Should().Be("Cagayan de Oro");
        cf["primary_province"].Should().Be("Misamis Oriental");
        cf["emergency_contact_name"].Should().Be("Parent Name");
        cf["emergency_contact_phone"].Should().Be("09171234567");
        cf["emergency_contact_relationship"].Should().Be("Mother");
    }

    [Fact]
    public void CanonicalHashAndChangedFields_ReturnsFieldNamesOnlyWithoutPhiValues()
    {
        var prev = new Dictionary<string, string?>
        {
            ["firstName"] = "Juan",
            ["contactNumber"] = "09170000001",
            ["dateOfBirth"] = null
        };
        var next = new Dictionary<string, string?>
        {
            ["firstName"] = "Juan",
            ["contactNumber"] = "09179999999",
            ["dateOfBirth"] = "2002-05-15"
        };

        var h1 = DeterministicUuid.ComputeCanonicalHash(prev);
        var h2 = DeterministicUuid.ComputeCanonicalHash(next);
        h1.Should().NotBe(h2);

        var changed = DeterministicUuid.ComputeChangedFieldNames(prev, next);
        changed.Should().BeEquivalentTo(new[] { "contactNumber", "dateOfBirth" });
    }

    [Fact]
    public void V1SyncMappingGuideCatalog_CoversAllThreeTracksAndParityEntitiesWithZeroVendorJargon()
    {
        var guide = V1SyncMappingGuideCatalog.Build();

        guide.Version.Should().NotBeNullOrWhiteSpace();
        guide.CoreProtections.Should().HaveCountGreaterThanOrEqualTo(5);
        guide.Tracks.Select(t => t.Track).Should().ContainInOrder(
            SyncTrack.Track1Clinic,
            SyncTrack.Track2Patient,
            SyncTrack.Track3Storage
        );

        var track1 = guide.Tracks.Single(t => t.Track == SyncTrack.Track1Clinic);
        var expectedTrack1Keys = new[]
        {
            "CustomFieldDefinitions",
            "Patients", "PatientAddresses", "PatientGuardians", "PatientAllergies",
            "PatientMedicalHistories", "PatientFamilyHistories", "PatientSocialHistories",
            "PatientReproductiveHistories", "PatientSurgicalHistories", "PatientImmunizations",
            "PatientPhilHealthMemberships", "PatientAlerts", "Appointments",
            "HistoricalQueueItems", "Consultations", "PatientVitals", "Prescriptions",
            "ClinicDispensingLogs", "DiagnosticLabOrders", "LabOrderItems",
            "MedicalCertificates", "RecordAttachments", "PatientPhysicalExams",
            "PatientHomeMedications"
        };
        track1.Entities.Select(e => e.Key).Should().Contain(expectedTrack1Keys);

        var track2 = guide.Tracks.Single(t => t.Track == SyncTrack.Track2Patient);
        var expectedTrack2Keys = new[]
        {
            "Patients", "PatientAddresses", "EmergencyContacts", "PatientAllergies",
            "PatientChronicConditions", "PatientPastIllnesses", "PatientFamilyHistories",
            "PatientSocialHistories", "PatientObstetricProfiles", "PatientSurgicalHistories",
            "PatientDisabilities", "PatientImmunizationsSelf", "PatientMedications",
            "PatientGovernmentIds", "FileRecords (Incl. PRIVATE)", "ClinicMemberships",
            "BoundClinicAppointments", "BoundClinicConsultations", "VitalSigns",
            "PrescriptionDocuments", "Prescriptions", "MedicalCertificates",
            "LabRequestSlips", "VaccinationsAdministered"
        };
        track2.Entities.Select(e => e.Key).Should().Contain(expectedTrack2Keys);

        var track3 = guide.Tracks.Single(t => t.Track == SyncTrack.Track3Storage);
        track3.Entities.Should().HaveCount(4);

        var serialized = System.Text.Json.JsonSerializer.Serialize(guide);
        serialized.Should().NotContain("Azure Blob");
        serialized.Should().NotContain("ClinicEZ");
        serialized.Should().NotContain(".cez");
        serialized.Should().NotContain("https://");
        serialized.Should().NotContain("MasterSecret");
        System.Text.RegularExpressions.Regex.IsMatch(serialized, @"\b(R2|CMK|PMK|DEK)\b")
            .Should().BeFalse("Mapping guide copy must stay operator-friendly and avoid vendor/internal crypto acronyms.");

        foreach (var track in guide.Tracks)
        {
            track.Title.Should().NotBeNullOrWhiteSpace();
            track.TargetDatabase.Should().NotBeNullOrWhiteSpace();
            track.Overview.Should().NotBeNullOrWhiteSpace();
            track.GlobalRules.Should().NotBeEmpty();
            track.Entities.Should().NotBeEmpty();

            foreach (var entity in track.Entities)
            {
                entity.Key.Should().NotBeNullOrWhiteSpace();
                entity.DisplayName.Should().NotBeNullOrWhiteSpace();
                entity.Category.Should().NotBeNullOrWhiteSpace();
                entity.V1SourceTables.Should().NotBeNullOrWhiteSpace();
                entity.V2TargetTable.Should().NotBeNullOrWhiteSpace();
                entity.Summary.Should().NotBeNullOrWhiteSpace();
                entity.Rules.Should().NotBeEmpty();
                entity.Columns.Should().NotBeEmpty();
            }
        }
    }
}
