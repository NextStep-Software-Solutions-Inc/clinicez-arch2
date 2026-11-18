using System;
using System.Text.Json;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Common;

public class PractitionerIdentityTests
{
    #region 1. NormalizePrc

    [Theory]
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("   ", null)]
    [InlineData("PRC", null)]
    [InlineData("prc", null)]
    [InlineData("PRC - .", null)]
    [InlineData("---", null)]
    [InlineData("12345", "0012345")]
    [InlineData("0012345", "0012345")]
    [InlineData("1234567", "1234567")]
    [InlineData("12345678", "12345678")]
    [InlineData("PRC-12345", "0012345")]
    [InlineData("prc 123-45", "0012345")]
    [InlineData("PRC.0123456", "0123456")]
    [InlineData("  prc - . 0012345  ", "0012345")]
    [InlineData("012-3456", "0123456")]
    [InlineData("ab-12345", "AB12345")]
    [InlineData("prc md-1234", "MD1234")]
    [InlineData("12345PRC", "12345PRC")]
    [InlineData("12345!", "12345!")]
    public void NormalizePrc_ReturnsExpectedNormalizedValue(string? input, string? expected)
    {
        PractitionerIdentity.NormalizePrc(input).Should().Be(expected);
    }

    #endregion

    #region 2. IsValidPrcFormat

    [Theory]
    [InlineData("12345", true)]
    [InlineData("0012345", true)]
    [InlineData("PRC-0123456", true)]
    [InlineData("12345678", true)]
    [InlineData("123456789012", true)]
    [InlineData("MD1234", true)]
    [InlineData("RN12345", true)]
    [InlineData("ab-1234", true)]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("PRC", false)]
    [InlineData("AB12", false)]
    [InlineData("ABC12", false)]
    [InlineData("ABCD123", false)]
    [InlineData("1234567890123", false)]
    [InlineData("12345!", false)]
    [InlineData("12345/6", false)]
    [InlineData("12345\u0661", false)]
    public void IsValidPrcFormat_ValidatesNormalizedLengthAlphanumericAndDigits(string? input, bool expected)
    {
        PractitionerIdentity.IsValidPrcFormat(input).Should().Be(expected);
    }

    #endregion

    #region 3. NormalizeProfessionKind & FromProfessionAndPrc

    [Theory]
    [InlineData("Doctor", "Doctor")]
    [InlineData(" doctor ", "Doctor")]
    [InlineData("DOCTOR", "Doctor")]
    [InlineData("Nurse", "Nurse")]
    [InlineData(" nurse ", "Nurse")]
    [InlineData("NURSE", "Nurse")]
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("   ", null)]
    [InlineData("Receptionist", null)]
    [InlineData("Admin", null)]
    [InlineData("Cashier", null)]
    [InlineData("Physician", null)]
    public void NormalizeProfessionKind_OnlyAcceptsDoctorOrNurse(string? role, string? expected)
    {
        PractitionerIdentity.NormalizeProfessionKind(role).Should().Be(expected);
    }

    [Fact]
    public void FromProfessionAndPrc_SeparatesDoctorAndNurseKeysWithSamePrc()
    {
        var doctorKey = PractitionerIdentity.FromProfessionAndPrc(" doctor ", "PRC-12345");
        var nurseKey = PractitionerIdentity.FromProfessionAndPrc("NURSE", "12345");

        doctorKey.Should().Be(("Doctor", "0012345"));
        nurseKey.Should().Be(("Nurse", "0012345"));
        doctorKey.Should().NotBe(nurseKey);
    }

    [Theory]
    [InlineData("Receptionist", "0012345")]
    [InlineData("", "0012345")]
    [InlineData("Doctor", "")]
    [InlineData("Doctor", "AB12")]
    [InlineData("Nurse", "ABC12")]
    [InlineData("Nurse", "12345!")]
    public void FromProfessionAndPrc_WithInvalidInputs_ThrowsArgumentException(string profession, string prc)
    {
        Action act = () => PractitionerIdentity.FromProfessionAndPrc(profession, prc);
        act.Should().Throw<ArgumentException>();
    }

    #endregion

    #region 4. IsCompatibleNameMatch

    [Theory]
    [InlineData("Maria", "Santos", "MARIA", " santos ", true)]
    [InlineData("Dr. Maria", "Santos", "Maria", "Santos", true)]
    [InlineData("Dra. Maria", "Cruz", "Maria", "Cruz", true)]
    [InlineData("Doctor Maria", "Cruz", "Maria", "Cruz", true)]
    [InlineData("RN Elena", "Reyes", "Elena", "Reyes", true)]
    [InlineData("R.N. Elena", "Reyes", "Elena", "Reyes", true)]
    [InlineData("Maria, MD", "Santos", "Maria", "Santos", true)]
    [InlineData("Dr.Maria", "Santos", "Maria", "Santos", true)]
    [InlineData("Maria", "Santos", "Maria Elena", "Santos", true)]
    [InlineData("Maria E.", "Santos", "Maria Elena", "Santos", true)]
    [InlineData("J.", "Dela Cruz", "Juan", "Dela  Cruz", true)]
    [InlineData("Juan-Carlos", "Reyes", "Juan Carlos", "Reyes", true)]
    [InlineData("Maria", "Santos", "Maria", "Reyes", false)]
    [InlineData("Maria", "Santos", "Jose", "Santos", false)]
    [InlineData("Maria Elena", "Santos", "Maria Teresa", "Santos", false)]
    [InlineData("Maria", "Santos", "Mario", "Santos", false)]
    [InlineData("Dr.", "Santos", "Maria", "Santos", false)]
    [InlineData("", "Santos", "Maria", "Santos", false)]
    [InlineData("Maria", "", "Maria", "Santos", false)]
    public void IsCompatibleNameMatch_EvaluatesLastNameTitlesAndGivenNameTokens(
        string firstA, string lastA, string firstB, string lastB, bool expected)
    {
        PractitionerIdentity.IsCompatibleNameMatch(firstA, lastA, firstB, lastB).Should().Be(expected);
    }

    #endregion

    #region 5. InteropTypes & Contract Serialization

    [Fact]
    public void InteropTypes_DirectoryVerificationConstants_MatchExpectedWireStrings()
    {
        InteropTypes.FacilityVerificationRequested.Should().Be("facility.verification.requested");
        InteropTypes.FacilityVerificationWithdrawn.Should().Be("facility.verification.withdrawn");
        InteropTypes.FacilityVerificationRejected.Should().Be("facility.verification.rejected");
        InteropTypes.PractitionerVerificationRequested.Should().Be("practitioner.verification.requested");
        InteropTypes.PractitionerIdentityUpdated.Should().Be("practitioner.identity.updated");
        InteropTypes.PractitionerVerificationRevoked.Should().Be("practitioner.verification.revoked");
    }

    [Fact]
    public void DirectoryVerificationEnums_SerializeAsStrictStringsAndRejectNumbers()
    {
        var json = JsonSerializer.Serialize(new
        {
            Platform = PlatformVerificationStatus.PendingReview,
            Practitioner = PractitionerVerificationLevel.AwaitingConfirmation,
            Source = DirectorySourceKind.PortalControlPlane
        }, InteropJson.Options);

        json.Should().Contain("\"PendingReview\"");
        json.Should().Contain("\"AwaitingConfirmation\"");
        json.Should().Contain("\"PortalControlPlane\"");

        var numericPlatform = () => JsonSerializer.Deserialize<PlatformVerificationStatus>("1", InteropJson.Options);
        var numericPractitioner = () => JsonSerializer.Deserialize<PractitionerVerificationLevel>("3", InteropJson.Options);
        var numericSource = () => JsonSerializer.Deserialize<DirectorySourceKind>("2", InteropJson.Options);

        numericPlatform.Should().Throw<JsonException>();
        numericPractitioner.Should().Throw<JsonException>();
        numericSource.Should().Throw<JsonException>();
    }

    [Fact]
    public void FacilityVerificationPayloads_RoundTripThroughInteropEnvelope()
    {
        var facilityId = Guid.NewGuid();
        var requestId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var serviceId = Guid.NewGuid();
        var from = Party.ForFacility("tenant-1", facilityId.ToString("N"), FacilityType.Clinic);

        var requested = new FacilityVerificationRequestedPayload
        {
            RequestId = requestId,
            TenantId = "tenant-1",
            FacilityId = facilityId,
            FacilityName = "St. Jude Health Clinic",
            FacilitySlug = "st-jude",
            Classification = "Ambulatory Clinic",
            DohLtoNumber = "DOH-LTO-2026-001",
            LtoEvidenceObjectKey = "evidence/tenant-1/lto-2026.pdf",
            Address = "Makati City",
            ContactNumber = "+639171234567",
            ContactEmail = "desk@stjude.example",
            OperatingHours = "Mon-Sat 8:00 AM - 5:00 PM",
            IsOnlineBookingPaused = false,
            RequestKind = "InitialVerification",
            SubmittedByClinicUserId = "user-1",
            SubmittedByDisplayName = "Clinic Admin",
            SubmittedAtUtc = new DateTime(2026, 11, 18, 5, 0, 0, DateTimeKind.Utc),
            Services =
            [
                new ClinicServiceDto(serviceId, "General Consultation", "Consultation", 600m, true)
            ],
            Practitioners =
            [
                new BundledPractitionerSubmissionDto
                {
                    ClinicStaffMemberId = staffId,
                    ProfessionKind = "Doctor",
                    FirstName = "Maria",
                    LastName = "Santos",
                    Title = "MD",
                    SubmittedPrcLicenseNo = "PRC-12345",
                    NormalizedPrcLicenseNo = "0012345",
                    PrcExpiryDate = new DateOnly(2028, 12, 31),
                    PrcEvidenceObjectKey = "evidence/tenant-1/prc-12345.jpg",
                    VerificationContact = "maria.santos@example.ph",
                    Specialty = "Internal Medicine",
                    PublicBio = "Internal medicine specialist.",
                    AvatarUrl = "https://cdn.example.ph/avatars/maria.jpg",
                    Availabilities =
                    [
                        new ProviderAvailabilityWindowDto(DayOfWeek.Monday, "09:00", "12:00", 30),
                        new ProviderAvailabilityWindowDto(DayOfWeek.Wednesday, "13:00", "17:00", 20)
                    ]
                }
            ]
        };

        var requestEnvelope = InteropEnvelope.FromJson(
            InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, from, Party.Portal, requestId, requested).ToJson());
        var roundTrippedRequested = requestEnvelope.GetPayload<FacilityVerificationRequestedPayload>();
        roundTrippedRequested.Should().BeEquivalentTo(requested);

        var withdrawn = new FacilityVerificationWithdrawnPayload
        {
            TenantId = "tenant-1",
            FacilityId = facilityId,
            WithdrawnByActor = "user-1",
            Reason = "Facility closed temporarily",
            WithdrawnAtUtc = new DateTime(2026, 11, 18, 6, 0, 0, DateTimeKind.Utc)
        };
        var roundTrippedWithdrawn = InteropEnvelope.FromJson(
            InteropEnvelope.Create(InteropTypes.FacilityVerificationWithdrawn, from, Party.Portal, Guid.NewGuid(), withdrawn).ToJson())
            .GetPayload<FacilityVerificationWithdrawnPayload>();
        roundTrippedWithdrawn.Should().Be(withdrawn);

        var rejected = new FacilityVerificationRejectedPayload
        {
            RequestId = requestId,
            TenantId = "tenant-1",
            FacilityId = facilityId,
            Status = "Rejected",
            Reason = "Expired DOH LTO certificate",
            ReviewedByAdminUserId = "admin-9",
            ReviewedAtUtc = new DateTime(2026, 11, 18, 7, 0, 0, DateTimeKind.Utc)
        };
        var roundTrippedRejected = InteropEnvelope.FromJson(
            InteropEnvelope.Create(InteropTypes.FacilityVerificationRejected, Party.Portal, from, requestId, rejected).ToJson())
            .GetPayload<FacilityVerificationRejectedPayload>();
        roundTrippedRejected.Should().Be(rejected);
    }

    [Fact]
    public void PractitionerVerificationPayloads_RoundTripThroughInteropEnvelope()
    {
        var facilityId = Guid.NewGuid();
        var requestId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var practitionerId = Guid.NewGuid();
        var mergedId = Guid.NewGuid();
        var from = Party.ForFacility("tenant-1", facilityId.ToString("N"), FacilityType.Clinic);

        var requested = new PractitionerVerificationRequestedPayload
        {
            RequestId = requestId,
            TenantId = "tenant-1",
            FacilityId = facilityId,
            FacilityName = "St. Jude Health Clinic",
            ClinicStaffMemberId = staffId,
            RequestKind = "Renewal",
            ProfessionKind = "Nurse",
            FirstName = "Elena",
            LastName = "Reyes",
            Title = "RN",
            SubmittedPrcLicenseNo = "PRC-987654",
            NormalizedPrcLicenseNo = "0987654",
            PrcExpiryDate = new DateOnly(2029, 6, 30),
            PrcEvidenceObjectKey = "evidence/tenant-1/nurse-prc.png",
            VerificationContact = "elena.reyes@example.ph",
            Specialty = "Primary Care Nursing",
            PublicBio = "Registered nurse.",
            AvatarUrl = "https://cdn.example.ph/avatars/elena.jpg",
            Availabilities =
            [
                new ProviderAvailabilityWindowDto(DayOfWeek.Tuesday, "08:00", "16:00", 15)
            ],
            SubmittedByClinicUserId = "user-2",
            SubmittedAtUtc = new DateTime(2026, 11, 18, 8, 0, 0, DateTimeKind.Utc)
        };

        var roundTrippedRequested = InteropEnvelope.FromJson(
            InteropEnvelope.Create(InteropTypes.PractitionerVerificationRequested, from, Party.Portal, requestId, requested).ToJson())
            .GetPayload<PractitionerVerificationRequestedPayload>();
        roundTrippedRequested.Should().BeEquivalentTo(requested);

        var updated = new PractitionerIdentityUpdatedPayload
        {
            PractitionerId = practitionerId,
            MergedIntoPractitionerId = mergedId,
            ProfessionKind = "Nurse",
            NormalizedPrcLicenseNo = "0987654",
            DisplayPrcLicenseNo = "0987654",
            PrcExpiryDate = new DateOnly(2029, 6, 30),
            VerificationLevel = PractitionerVerificationLevel.Verified,
            FirstName = "Elena",
            LastName = "Reyes",
            Title = "RN",
            PrimarySpecialty = "Primary Care Nursing",
            PublicBio = "Registered nurse.",
            AvatarUrl = "https://cdn.example.ph/avatars/elena.jpg",
            VerifiedAtUtc = new DateTime(2026, 11, 18, 9, 0, 0, DateTimeKind.Utc),
            TenantId = "tenant-1",
            FacilityId = facilityId,
            ClinicStaffMemberId = staffId,
            AffiliationStatus = "Active",
            LocalSpecialty = "Outpatient Triage",
            Availabilities =
            [
                new ProviderAvailabilityWindowDto(DayOfWeek.Thursday, "10:00", "14:00", 30)
            ]
        };

        var roundTrippedUpdated = InteropEnvelope.FromJson(
            InteropEnvelope.Create(InteropTypes.PractitionerIdentityUpdated, Party.Portal, from, requestId, updated).ToJson())
            .GetPayload<PractitionerIdentityUpdatedPayload>();
        roundTrippedUpdated.Should().BeEquivalentTo(updated);

        var revoked = new PractitionerVerificationRevokedPayload
        {
            PractitionerId = practitionerId,
            TenantId = "tenant-1",
            FacilityId = facilityId,
            ClinicStaffMemberId = staffId,
            ProfessionKind = "Nurse",
            NormalizedPrcLicenseNo = "0987654",
            NewStatus = PractitionerVerificationLevel.Suspended,
            Reason = "PRC license suspended pending review",
            RevokedAtUtc = new DateTime(2026, 11, 18, 10, 0, 0, DateTimeKind.Utc)
        };

        var roundTrippedRevoked = InteropEnvelope.FromJson(
            InteropEnvelope.Create(InteropTypes.PractitionerVerificationRevoked, Party.Portal, from, Guid.NewGuid(), revoked).ToJson())
            .GetPayload<PractitionerVerificationRevokedPayload>();
        roundTrippedRevoked.Should().Be(revoked);
    }

    [Fact]
    public void FacilityCreatedEvent_And_AppointmentBookedEvent_Extensions_RoundTripAndPreserveLegacyDefaults()
    {
        var canonicalId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();

        var legacyDto = new FacilityProviderDto(providerId, "Dr. Maria Santos", "Pediatrics", "0012345", true, 1);
        legacyDto.Role.Should().BeNull();
        legacyDto.CanonicalProviderId.Should().BeNull();
        legacyDto.IsDirectoryOptIn.Should().BeTrue();
        legacyDto.VerificationStatus.Should().Be(PractitionerVerificationLevel.Unverified);

        var extendedProvider = new FacilityProviderDto(
            Id: providerId,
            Name: "Dr. Maria Santos",
            Specialty: "Pediatrics",
            ProfessionalLicenseNo: "PRC-12345",
            IsActive: true,
            DisplayOrder: 0,
            Role: "Doctor",
            CanonicalProviderId: canonicalId,
            NormalizedLicenseNo: "0012345",
            PrcExpiryDate: new DateOnly(2028, 12, 31),
            IsDirectoryOptIn: true,
            VerificationStatus: PractitionerVerificationLevel.Verified,
            FirstName: "Maria",
            LastName: "Santos",
            Bio: "Pediatrician",
            AvatarUrl: "https://cdn.example.ph/avatars/maria.jpg",
            Availabilities: [new ProviderAvailabilityWindowDto(DayOfWeek.Friday, "09:00", "17:00", 30)]);

        var facilityEvent = new FacilityCreatedEvent
        {
            TenantId = "tenant-1",
            FacilityType = FacilityType.Clinic,
            ResourceId = clinicId,
            Name = "St. Jude Health Clinic",
            Providers = [extendedProvider],
            IsPlatformVerified = true,
            PlatformVerificationStatus = PlatformVerificationStatus.Verified,
            VerificationRejectionReason = null,
            DirectorySource = DirectorySourceKind.PortalControlPlane,
            ReplaceProvidersSnapshot = false
        };

        var facilityJson = JsonSerializer.Serialize(facilityEvent, InteropJson.Options);
        var facilityCopy = JsonSerializer.Deserialize<FacilityCreatedEvent>(facilityJson, InteropJson.Options)!;
        facilityCopy.IsPlatformVerified.Should().BeTrue();
        facilityCopy.PlatformVerificationStatus.Should().Be(PlatformVerificationStatus.Verified);
        facilityCopy.DirectorySource.Should().Be(DirectorySourceKind.PortalControlPlane);
        facilityCopy.ReplaceProvidersSnapshot.Should().BeFalse();
        facilityCopy.Providers.Should().ContainSingle();
        facilityCopy.Providers![0].CanonicalProviderId.Should().Be(canonicalId);
        facilityCopy.Providers[0].VerificationStatus.Should().Be(PractitionerVerificationLevel.Verified);
        facilityCopy.Providers[0].Availabilities.Should().ContainSingle(w => w.DayOfWeek == DayOfWeek.Friday);

        var legacyFacilityJson = $$"""
            {
              "tenantId": "tenant-legacy",
              "facilityType": "Clinic",
              "resourceId": "{{clinicId}}",
              "name": "Legacy Clinic",
              "providers": [
                {
                  "id": "{{providerId}}",
                  "name": "Dr. Legacy",
                  "specialty": "General Practice",
                  "professionalLicenseNo": "12345",
                  "isActive": true,
                  "displayOrder": 0
                }
              ]
            }
            """;
        var deserializedLegacy = JsonSerializer.Deserialize<FacilityCreatedEvent>(legacyFacilityJson, InteropJson.Options)!;
        deserializedLegacy.DirectorySource.Should().Be(DirectorySourceKind.Unspecified);
        deserializedLegacy.ReplaceProvidersSnapshot.Should().BeTrue();
        deserializedLegacy.Providers![0].IsDirectoryOptIn.Should().BeTrue();
        deserializedLegacy.Providers[0].VerificationStatus.Should().Be(PractitionerVerificationLevel.Unverified);

        var booked = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = clinicId,
            ProviderId = providerId,
            ProviderName = "Dr. Maria Santos",
            CanonicalProviderId = canonicalId,
            TenantId = "tenant-1"
        };

        var bookedJson = JsonSerializer.Serialize(booked, InteropJson.Options);
        var bookedCopy = JsonSerializer.Deserialize<AppointmentBookedEvent>(bookedJson, InteropJson.Options)!;
        bookedCopy.ProviderId.Should().Be(providerId);
        bookedCopy.ProviderName.Should().Be("Dr. Maria Santos");
        bookedCopy.CanonicalProviderId.Should().Be(canonicalId);
    }

    #endregion
}
