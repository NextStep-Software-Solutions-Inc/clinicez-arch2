using System.Text.Json;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Background;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Shared.Tests.Interop;

public sealed class VerificationResponderRecorder
{
    public List<(FacilityVerificationUpdateRequestedPayload Request, InteropMessageContext Context)> FacilityRequests { get; } = new();
    public List<(PractitionerVerificationUpdateRequestedPayload Request, InteropMessageContext Context)> PractitionerRequests { get; } = new();
    public Func<PractitionerVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload>? PractitionerReplyOverride { get; set; }
}

public sealed class FacilityVerificationUpdateTestResponder
    : IInteropResponder<FacilityVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload>
{
    private readonly VerificationResponderRecorder _recorder;

    public FacilityVerificationUpdateTestResponder(VerificationResponderRecorder recorder) => _recorder = recorder;

    public Task<VerificationUpdateRespondedPayload> RespondAsync(
        FacilityVerificationUpdateRequestedPayload request,
        InteropMessageContext context,
        CancellationToken ct)
    {
        _recorder.FacilityRequests.Add((request, context));
        return Task.FromResult(new VerificationUpdateRespondedPayload
        {
            Succeeded = true,
            Conflict = false,
            CurrentStatus = "PendingReview",
            Message = "Pending facility verification submission updated in place.",
            RequestId = request.ExpectedRequestId ?? Guid.NewGuid(),
            UpdatedAtUtc = request.UpdatedAtUtc
        });
    }
}

public sealed class PractitionerVerificationUpdateTestResponder
    : IInteropResponder<PractitionerVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload>
{
    private readonly VerificationResponderRecorder _recorder;

    public PractitionerVerificationUpdateTestResponder(VerificationResponderRecorder recorder) => _recorder = recorder;

    public Task<VerificationUpdateRespondedPayload> RespondAsync(
        PractitionerVerificationUpdateRequestedPayload request,
        InteropMessageContext context,
        CancellationToken ct)
    {
        _recorder.PractitionerRequests.Add((request, context));
        if (_recorder.PractitionerReplyOverride is not null)
            return Task.FromResult(_recorder.PractitionerReplyOverride(request));

        return Task.FromResult(new VerificationUpdateRespondedPayload
        {
            Succeeded = true,
            Conflict = false,
            CurrentStatus = "PendingReview",
            Message = "Pending practitioner verification submission updated in place.",
            RequestId = request.ExpectedRequestId ?? Guid.NewGuid(),
            UpdatedAtUtc = request.UpdatedAtUtc
        });
    }
}

public class DirectoryVerificationContractsTests
{
    private sealed class HubParticipant : IDisposable
    {
        public ServiceProvider Provider { get; }
        public IInteropRequestClient Client => Provider.GetRequiredService<IInteropRequestClient>();
        public InteropRelayService Relay => Provider.GetRequiredService<InteropRelayService>();
        public InteropInboxPollerService Poller => Provider.GetRequiredService<InteropInboxPollerService>();
        public VerificationResponderRecorder Recorder => Provider.GetRequiredService<VerificationResponderRecorder>();

        public HubParticipant(
            InProcessHub hub,
            string service,
            Action<InteropHandlerBuilder> handlers,
            VerificationResponderRecorder? recorder = null)
        {
            var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Messaging:Transport"] = "InProcess",
                ["Messaging:Service"] = service,
                ["Messaging:Enabled"] = "true",
                ["Messaging:RelayIntervalMs"] = "20"
            }).Build();

            var dbName = Guid.NewGuid().ToString();
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddSingleton<IConfiguration>(config);
            services.AddSingleton(hub);
            services.AddSingleton(recorder ?? new VerificationResponderRecorder());
            services.AddDbContext<TestDbContext>(o => o.UseInMemoryDatabase(dbName));
            services.AddInterop<TestDbContext>(config, handlers);
            Provider = services.BuildServiceProvider();
        }

        public void Dispose() => Provider.Dispose();
    }

    [Fact]
    public void InteropTypes_VerificationUpdateConstants_MatchExpectedWireStrings()
    {
        InteropTypes.FacilityVerificationUpdateRequested.Should().Be("facility.verification.update.requested");
        InteropTypes.FacilityVerificationUpdateResponded.Should().Be("facility.verification.update.responded");
        InteropTypes.PractitionerVerificationUpdateRequested.Should().Be("practitioner.verification.update.requested");
        InteropTypes.PractitionerVerificationUpdateResponded.Should().Be("practitioner.verification.update.responded");
    }

    [Fact]
    public void FacilityVerificationRequestedPayload_With217Fields_RoundTripsThroughInteropEnvelope()
    {
        var facilityId = Guid.NewGuid();
        var requestId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var serviceId = Guid.NewGuid();
        var from = Party.ForFacility("tenant-217", facilityId.ToString("N"), FacilityType.Clinic);

        var payload = new FacilityVerificationRequestedPayload
        {
            RequestId = requestId,
            TenantId = "tenant-217",
            FacilityId = facilityId,
            FacilityName = "Bayview Telehealth Clinic",
            FacilitySlug = "bayview-telehealth",
            Classification = "Primary Care Clinic",
            DohLtoNumber = "DOH-LTO-2026-999",
            DohLtoExpiryDate = new DateOnly(2028, 11, 30),
            LtoEvidenceObjectKey = "tenants/tenant-217/lto/cert.pdf",
            Address = "BGC, Taguig",
            ContactNumber = "+63281234567",
            ContactEmail = "hello@bayview.ph",
            OperatingHours = "Mon-Fri 8:00 AM - 6:00 PM",
            IsOnlineBookingPaused = false,
            PhilHealthAccreditationNumber = "PH-2026-0042",
            IsPhilHealthAccredited = true,
            SupportsInPerson = false,
            SupportsTeleconsult = true,
            RequestKind = "InitialVerification",
            SubmittedByClinicUserId = "user-217",
            SubmittedByDisplayName = "Dr. Clara Reyes",
            SubmittedAtUtc = new DateTime(2026, 11, 19, 10, 0, 0, DateTimeKind.Utc),
            Services =
            [
                new ClinicServiceDto(serviceId, "Teleconsultation", "Consultation", 500m, true)
            ],
            Practitioners =
            [
                new BundledPractitionerSubmissionDto
                {
                    ClinicStaffMemberId = staffId,
                    ProfessionKind = "Doctor",
                    FirstName = "Clara",
                    LastName = "Reyes",
                    Title = "MD",
                    SubmittedPrcLicenseNo = "PRC-777888",
                    NormalizedPrcLicenseNo = "0777888",
                    PrcExpiryDate = new DateOnly(2029, 4, 15),
                    PrcEvidenceObjectKey = "tenants/tenant-217/prc/clara.pdf"
                }
            ]
        };

        var json = InteropEnvelope.Create(
            InteropTypes.FacilityVerificationRequested,
            from,
            Party.Portal,
            requestId,
            payload).ToJson();

        var roundTripped = InteropEnvelope.FromJson(json).GetPayload<FacilityVerificationRequestedPayload>();
        roundTripped.Should().BeEquivalentTo(payload);
        roundTripped.DohLtoExpiryDate.Should().Be(new DateOnly(2028, 11, 30));
        roundTripped.PhilHealthAccreditationNumber.Should().Be("PH-2026-0042");
        roundTripped.IsPhilHealthAccredited.Should().BeTrue();
        roundTripped.SupportsInPerson.Should().BeFalse();
        roundTripped.SupportsTeleconsult.Should().BeTrue();
    }

    [Fact]
    public void PractitionerVerificationRequestedPayload_WithSubmittedByDisplayName_RoundTripsThroughInteropEnvelope()
    {
        var facilityId = Guid.NewGuid();
        var requestId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var from = Party.ForFacility("tenant-217", facilityId.ToString("N"), FacilityType.Clinic);

        var payload = new PractitionerVerificationRequestedPayload
        {
            RequestId = requestId,
            TenantId = "tenant-217",
            FacilityId = facilityId,
            FacilityName = "Bayview Telehealth Clinic",
            ClinicStaffMemberId = staffId,
            RequestKind = "InitialVerification",
            ProfessionKind = "Doctor",
            FirstName = "Marco",
            LastName = "Diaz",
            Title = "MD",
            SubmittedPrcLicenseNo = "PRC-555111",
            NormalizedPrcLicenseNo = "0555111",
            PrcExpiryDate = new DateOnly(2030, 1, 20),
            PrcEvidenceObjectKey = "tenants/tenant-217/prc/marco.pdf",
            VerificationContact = "marco.diaz@bayview.ph",
            Specialty = "Family Medicine",
            PublicBio = "Family medicine physician.",
            AvatarUrl = "https://cdn.bayview.ph/marco.jpg",
            Availabilities = [new ProviderAvailabilityWindowDto(DayOfWeek.Monday, "09:00", "12:00", 30)],
            SubmittedByClinicUserId = "user-admin-1",
            SubmittedByDisplayName = "Nurse Ana Villanueva",
            SubmittedAtUtc = new DateTime(2026, 11, 19, 11, 15, 0, DateTimeKind.Utc)
        };

        var json = InteropEnvelope.Create(
            InteropTypes.PractitionerVerificationRequested,
            from,
            Party.Portal,
            requestId,
            payload).ToJson();

        var roundTripped = InteropEnvelope.FromJson(json).GetPayload<PractitionerVerificationRequestedPayload>();
        roundTripped.Should().BeEquivalentTo(payload);
        roundTripped.SubmittedByDisplayName.Should().Be("Nurse Ana Villanueva");
    }

    [Fact]
    public void UpdatePayloads_And_VerificationUpdateRespondedPayload_RoundTripThroughInteropEnvelope()
    {
        var facilityId = Guid.NewGuid();
        var expectedRequestId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var serviceId = Guid.NewGuid();
        var from = Party.ForFacility("tenant-218", facilityId.ToString("N"), FacilityType.Clinic);

        var facilityUpdate = new FacilityVerificationUpdateRequestedPayload
        {
            TenantId = "tenant-218",
            FacilityId = facilityId,
            FacilityName = "Updated Care Clinic",
            FacilitySlug = "updated-care",
            Classification = "Multispecialty Clinic",
            DohLtoNumber = "DOH-LTO-2026-500",
            DohLtoExpiryDate = new DateOnly(2029, 8, 15),
            LtoEvidenceObjectKey = "tenants/tenant-218/lto/updated.pdf",
            Address = "Cebu City",
            ContactNumber = "+63322345678",
            ContactEmail = "updated@care.ph",
            OperatingHours = "Mon-Sun 7:00 AM - 9:00 PM",
            IsOnlineBookingPaused = true,
            PhilHealthAccreditationNumber = "PH-CEBU-101",
            IsPhilHealthAccredited = true,
            SupportsInPerson = true,
            SupportsTeleconsult = true,
            SubmittedByClinicUserId = "user-218",
            SubmittedByDisplayName = "Clinic Manager Mia",
            UpdatedAtUtc = new DateTime(2026, 11, 19, 12, 30, 0, DateTimeKind.Utc),
            ExpectedRequestId = expectedRequestId,
            ExpectedStatus = "PendingReview",
            Services = [new ClinicServiceDto(serviceId, "Cardiology", "Specialist", 1200m, true)],
            Practitioners =
            [
                new BundledPractitionerSubmissionDto
                {
                    ClinicStaffMemberId = staffId,
                    ProfessionKind = "Doctor",
                    FirstName = "Jose",
                    LastName = "Lim",
                    SubmittedPrcLicenseNo = "PRC-321654",
                    NormalizedPrcLicenseNo = "0321654",
                    PrcExpiryDate = new DateOnly(2028, 5, 1),
                    PrcEvidenceObjectKey = "tenants/tenant-218/prc/jose.pdf"
                }
            ]
        };

        var roundTrippedFacilityUpdate = InteropEnvelope.FromJson(
            InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateRequested, from, Party.Portal, Guid.NewGuid(), facilityUpdate).ToJson())
            .GetPayload<FacilityVerificationUpdateRequestedPayload>();
        roundTrippedFacilityUpdate.Should().BeEquivalentTo(facilityUpdate);

        var practitionerUpdate = new PractitionerVerificationUpdateRequestedPayload
        {
            TenantId = "tenant-218",
            FacilityId = facilityId,
            FacilityName = "Updated Care Clinic",
            ClinicStaffMemberId = staffId,
            ProfessionKind = "Doctor",
            FirstName = "Jose",
            LastName = "Lim",
            Title = "MD, FPCP",
            SubmittedPrcLicenseNo = "PRC-321654",
            NormalizedPrcLicenseNo = "0321654",
            PrcExpiryDate = new DateOnly(2028, 5, 1),
            PrcEvidenceObjectKey = "tenants/tenant-218/prc/jose-v2.pdf",
            VerificationContact = "jose.lim@care.ph",
            Specialty = "Cardiology",
            PublicBio = "Updated bio.",
            AvatarUrl = "https://cdn.care.ph/jose.jpg",
            Availabilities = [new ProviderAvailabilityWindowDto(DayOfWeek.Friday, "13:00", "17:00", 30)],
            SubmittedByClinicUserId = "user-218",
            SubmittedByDisplayName = "Clinic Manager Mia",
            UpdatedAtUtc = new DateTime(2026, 11, 19, 12, 35, 0, DateTimeKind.Utc),
            ExpectedRequestId = expectedRequestId,
            ExpectedStatus = "PendingReview"
        };

        var roundTrippedPractitionerUpdate = InteropEnvelope.FromJson(
            InteropEnvelope.Create(InteropTypes.PractitionerVerificationUpdateRequested, from, Party.Portal, Guid.NewGuid(), practitionerUpdate).ToJson())
            .GetPayload<PractitionerVerificationUpdateRequestedPayload>();
        roundTrippedPractitionerUpdate.Should().BeEquivalentTo(practitionerUpdate);

        var successReply = new VerificationUpdateRespondedPayload
        {
            Succeeded = true,
            Conflict = false,
            ErrorCode = null,
            CurrentStatus = "PendingReview",
            Message = "Updated in place.",
            RequestId = expectedRequestId,
            UpdatedAtUtc = new DateTime(2026, 11, 19, 12, 35, 1, DateTimeKind.Utc)
        };

        var roundTrippedSuccess = InteropEnvelope.FromJson(
            InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateResponded, Party.Portal, from, expectedRequestId, successReply).ToJson())
            .GetPayload<VerificationUpdateRespondedPayload>();
        roundTrippedSuccess.Should().Be(successReply);

        var conflictReply = new VerificationUpdateRespondedPayload
        {
            Succeeded = false,
            Conflict = true,
            ErrorCode = "verification_request_not_pending",
            CurrentStatus = "Approved",
            Message = "Verification request is already Approved and cannot be updated in place.",
            RequestId = expectedRequestId,
            UpdatedAtUtc = new DateTime(2026, 11, 19, 12, 40, 0, DateTimeKind.Utc)
        };

        var roundTrippedConflict = InteropEnvelope.FromJson(
            InteropEnvelope.Create(InteropTypes.PractitionerVerificationUpdateResponded, Party.Portal, from, expectedRequestId, conflictReply).ToJson())
            .GetPayload<VerificationUpdateRespondedPayload>();
        roundTrippedConflict.Should().Be(conflictReply);
    }

    [Fact]
    public void LegacyJson_Without217Or218Fields_DeserializesWithExpectedDefaults()
    {
        var facilityId = Guid.NewGuid();
        var requestId = Guid.NewGuid();
        var staffId = Guid.NewGuid();

        var legacyFacilityJson = $$"""
            {
              "requestId": "{{requestId}}",
              "tenantId": "tenant-legacy",
              "facilityId": "{{facilityId}}",
              "facilityName": "Legacy Health Center",
              "dohLtoNumber": "DOH-LEGACY-1",
              "requestKind": "InitialVerification"
            }
            """;

        var facility = JsonSerializer.Deserialize<FacilityVerificationRequestedPayload>(legacyFacilityJson, InteropJson.Options)!;
        facility.DohLtoExpiryDate.Should().BeNull();
        facility.PhilHealthAccreditationNumber.Should().BeNull();
        facility.IsPhilHealthAccredited.Should().BeFalse();
        facility.SupportsInPerson.Should().BeTrue();
        facility.SupportsTeleconsult.Should().BeFalse();

        var legacyPractitionerJson = $$"""
            {
              "requestId": "{{requestId}}",
              "tenantId": "tenant-legacy",
              "facilityId": "{{facilityId}}",
              "facilityName": "Legacy Health Center",
              "clinicStaffMemberId": "{{staffId}}",
              "requestKind": "InitialVerification",
              "professionKind": "Doctor",
              "firstName": "Juan",
              "lastName": "Dela Cruz",
              "submittedPrcLicenseNo": "12345",
              "normalizedPrcLicenseNo": "0012345"
            }
            """;

        var practitioner = JsonSerializer.Deserialize<PractitionerVerificationRequestedPayload>(legacyPractitionerJson, InteropJson.Options)!;
        practitioner.SubmittedByDisplayName.Should().BeNull();

        var minimalFacilityUpdateJson = $$"""
            {
              "tenantId": "tenant-legacy",
              "facilityId": "{{facilityId}}",
              "facilityName": "Legacy Health Center"
            }
            """;

        var facilityUpdate = JsonSerializer.Deserialize<FacilityVerificationUpdateRequestedPayload>(minimalFacilityUpdateJson, InteropJson.Options)!;
        facilityUpdate.DohLtoExpiryDate.Should().BeNull();
        facilityUpdate.PhilHealthAccreditationNumber.Should().BeNull();
        facilityUpdate.IsPhilHealthAccredited.Should().BeFalse();
        facilityUpdate.SupportsInPerson.Should().BeTrue();
        facilityUpdate.SupportsTeleconsult.Should().BeFalse();
        facilityUpdate.SubmittedByDisplayName.Should().BeNull();
        facilityUpdate.ExpectedRequestId.Should().BeNull();
        facilityUpdate.ExpectedStatus.Should().Be("PendingReview");

        var minimalPractitionerUpdateJson = $$"""
            {
              "tenantId": "tenant-legacy",
              "facilityId": "{{facilityId}}",
              "facilityName": "Legacy Health Center",
              "clinicStaffMemberId": "{{staffId}}",
              "professionKind": "Doctor",
              "firstName": "Juan",
              "lastName": "Dela Cruz"
            }
            """;

        var practitionerUpdate = JsonSerializer.Deserialize<PractitionerVerificationUpdateRequestedPayload>(minimalPractitionerUpdateJson, InteropJson.Options)!;
        practitionerUpdate.SubmittedByDisplayName.Should().BeNull();
        practitionerUpdate.ExpectedRequestId.Should().BeNull();
        practitionerUpdate.ExpectedStatus.Should().Be("PendingReview");
    }

    [Fact]
    public void UpdatePayloads_ExpectedStatus_RoundTripsNullAndAwaitingOtpWhileOmittedDefaultsToPendingReview()
    {
        var facilityId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var from = Party.ForFacility("tenant-expected-status", facilityId.ToString("N"), FacilityType.Clinic);

        var defaultFacility = new FacilityVerificationUpdateRequestedPayload
        {
            TenantId = "tenant-expected-status",
            FacilityId = facilityId,
            FacilityName = "Default Status Clinic"
        };
        defaultFacility.ExpectedStatus.Should().Be("PendingReview");

        var defaultPractitioner = new PractitionerVerificationUpdateRequestedPayload
        {
            TenantId = "tenant-expected-status",
            FacilityId = facilityId,
            FacilityName = "Default Status Clinic",
            ClinicStaffMemberId = staffId,
            ProfessionKind = "Doctor",
            FirstName = "Ana",
            LastName = "Reyes"
        };
        defaultPractitioner.ExpectedStatus.Should().Be("PendingReview");

        // 1. Explicit null must serialize as "expectedStatus":null and round-trip as null (not "PendingReview").
        var nullFacility = defaultFacility with { ExpectedStatus = null };
        var nullFacilityJson = JsonSerializer.Serialize(nullFacility, InteropJson.Options);
        nullFacilityJson.Should().Contain("\"expectedStatus\":null");
        JsonSerializer.Deserialize<FacilityVerificationUpdateRequestedPayload>(nullFacilityJson, InteropJson.Options)!
            .ExpectedStatus.Should().BeNull();

        var nullFacilityEnvelopeJson = InteropEnvelope.Create(
            InteropTypes.FacilityVerificationUpdateRequested,
            from,
            Party.Portal,
            Guid.NewGuid(),
            nullFacility).ToJson();
        nullFacilityEnvelopeJson.Should().Contain("\"expectedStatus\":null");
        InteropEnvelope.FromJson(nullFacilityEnvelopeJson)
            .GetPayload<FacilityVerificationUpdateRequestedPayload>()
            .ExpectedStatus.Should().BeNull();

        var nullPractitioner = defaultPractitioner with { ExpectedStatus = null };
        var nullPractitionerJson = JsonSerializer.Serialize(nullPractitioner, InteropJson.Options);
        nullPractitionerJson.Should().Contain("\"expectedStatus\":null");
        JsonSerializer.Deserialize<PractitionerVerificationUpdateRequestedPayload>(nullPractitionerJson, InteropJson.Options)!
            .ExpectedStatus.Should().BeNull();

        var nullPractitionerEnvelopeJson = InteropEnvelope.Create(
            InteropTypes.PractitionerVerificationUpdateRequested,
            from,
            Party.Portal,
            Guid.NewGuid(),
            nullPractitioner).ToJson();
        nullPractitionerEnvelopeJson.Should().Contain("\"expectedStatus\":null");
        InteropEnvelope.FromJson(nullPractitionerEnvelopeJson)
            .GetPayload<PractitionerVerificationUpdateRequestedPayload>()
            .ExpectedStatus.Should().BeNull();

        // 2. Explicit non-default status ("AwaitingOtp") round-trips across InteropJson.Options and InteropEnvelope.
        var otpFacility = defaultFacility with { ExpectedStatus = "AwaitingOtp" };
        var otpFacilityJson = JsonSerializer.Serialize(otpFacility, InteropJson.Options);
        JsonSerializer.Deserialize<FacilityVerificationUpdateRequestedPayload>(otpFacilityJson, InteropJson.Options)!
            .ExpectedStatus.Should().Be("AwaitingOtp");
        InteropEnvelope.FromJson(
            InteropEnvelope.Create(
                InteropTypes.FacilityVerificationUpdateRequested,
                from,
                Party.Portal,
                Guid.NewGuid(),
                otpFacility).ToJson())
            .GetPayload<FacilityVerificationUpdateRequestedPayload>()
            .ExpectedStatus.Should().Be("AwaitingOtp");

        var otpPractitioner = defaultPractitioner with { ExpectedStatus = "AwaitingOtp" };
        var otpPractitionerJson = JsonSerializer.Serialize(otpPractitioner, InteropJson.Options);
        JsonSerializer.Deserialize<PractitionerVerificationUpdateRequestedPayload>(otpPractitionerJson, InteropJson.Options)!
            .ExpectedStatus.Should().Be("AwaitingOtp");
        InteropEnvelope.FromJson(
            InteropEnvelope.Create(
                InteropTypes.PractitionerVerificationUpdateRequested,
                from,
                Party.Portal,
                Guid.NewGuid(),
                otpPractitioner).ToJson())
            .GetPayload<PractitionerVerificationUpdateRequestedPayload>()
            .ExpectedStatus.Should().Be("AwaitingOtp");

        // 3. JSON omitting "expectedStatus" still defaults to "PendingReview" across InteropJson.Options and InteropEnvelope.
        var omittedFacilityJson = $$"""
            {
              "tenantId": "tenant-expected-status",
              "facilityId": "{{facilityId}}",
              "facilityName": "Default Status Clinic"
            }
            """;
        JsonSerializer.Deserialize<FacilityVerificationUpdateRequestedPayload>(omittedFacilityJson, InteropJson.Options)!
            .ExpectedStatus.Should().Be("PendingReview");

        var omittedPractitionerJson = $$"""
            {
              "tenantId": "tenant-expected-status",
              "facilityId": "{{facilityId}}",
              "facilityName": "Default Status Clinic",
              "clinicStaffMemberId": "{{staffId}}",
              "professionKind": "Doctor",
              "firstName": "Ana",
              "lastName": "Reyes"
            }
            """;
        JsonSerializer.Deserialize<PractitionerVerificationUpdateRequestedPayload>(omittedPractitionerJson, InteropJson.Options)!
            .ExpectedStatus.Should().Be("PendingReview");

        var omittedFacilityEnvelopeJson = $$"""
            {
              "messageId": "{{Guid.NewGuid()}}",
              "correlationId": "{{Guid.NewGuid()}}",
              "type": "{{InteropTypes.FacilityVerificationUpdateRequested}}",
              "schemaVersion": 1,
              "from": { "kind": "Facility", "tenantId": "tenant-expected-status", "facilityId": "{{facilityId:N}}", "facilityType": "Clinic" },
              "to": { "kind": "ControlPlane", "service": "portal" },
              "sentAtUtc": "2026-11-19T12:00:00Z",
              "payload": {{omittedFacilityJson}}
            }
            """;
        InteropEnvelope.FromJson(omittedFacilityEnvelopeJson)
            .GetPayload<FacilityVerificationUpdateRequestedPayload>()
            .ExpectedStatus.Should().Be("PendingReview");

        var omittedPractitionerEnvelopeJson = $$"""
            {
              "messageId": "{{Guid.NewGuid()}}",
              "correlationId": "{{Guid.NewGuid()}}",
              "type": "{{InteropTypes.PractitionerVerificationUpdateRequested}}",
              "schemaVersion": 1,
              "from": { "kind": "Facility", "tenantId": "tenant-expected-status", "facilityId": "{{facilityId:N}}", "facilityType": "Clinic" },
              "to": { "kind": "ControlPlane", "service": "portal" },
              "sentAtUtc": "2026-11-19T12:00:00Z",
              "payload": {{omittedPractitionerJson}}
            }
            """;
        InteropEnvelope.FromJson(omittedPractitionerEnvelopeJson)
            .GetPayload<PractitionerVerificationUpdateRequestedPayload>()
            .ExpectedStatus.Should().Be("PendingReview");
    }

    [Fact]
    public async Task InProcessHub_RequestReply_FacilityAndPractitionerVerificationUpdates_RoundTripWithFidelity()
    {
        var hub = new InProcessHub();
        var facilityId = Guid.NewGuid();
        var clinicParty = Party.ForFacility("tenant-e2e", facilityId.ToString("N"), FacilityType.Clinic);
        var expectedRequestId = Guid.NewGuid();
        var staffId = Guid.NewGuid();

        var recorder = new VerificationResponderRecorder
        {
            PractitionerReplyOverride = req => new VerificationUpdateRespondedPayload
            {
                Succeeded = false,
                Conflict = true,
                ErrorCode = "verification_request_not_pending",
                CurrentStatus = "Approved",
                Message = $"Practitioner request {req.ExpectedRequestId} is already Approved.",
                RequestId = req.ExpectedRequestId,
                UpdatedAtUtc = req.UpdatedAtUtc
            }
        };

        using var clinic = new HubParticipant(hub, InteropServices.Clinic, h => h
            .HandleReply(InteropTypes.FacilityVerificationUpdateResponded)
            .HandleReply(InteropTypes.PractitionerVerificationUpdateResponded));

        using var portal = new HubParticipant(hub, InteropServices.Portal, h => h
            .Respond<FacilityVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload, FacilityVerificationUpdateTestResponder>(
                InteropTypes.FacilityVerificationUpdateRequested,
                InteropTypes.FacilityVerificationUpdateResponded)
            .Respond<PractitionerVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload, PractitionerVerificationUpdateTestResponder>(
                InteropTypes.PractitionerVerificationUpdateRequested,
                InteropTypes.PractitionerVerificationUpdateResponded),
            recorder);

        using var stop = new CancellationTokenSource();
        var pump = Task.Run(async () =>
        {
            while (!stop.IsCancellationRequested)
            {
                await clinic.Relay.RunOnceAsync(CancellationToken.None);
                await portal.Relay.RunOnceAsync(CancellationToken.None);
                await clinic.Poller.RunOnceAsync(0, CancellationToken.None);
                await portal.Poller.RunOnceAsync(0, CancellationToken.None);
                await Task.Delay(5);
            }
        });

        try
        {
            var facilityRequest = new FacilityVerificationUpdateRequestedPayload
            {
                TenantId = "tenant-e2e",
                FacilityId = facilityId,
                FacilityName = "E2E Wellness Clinic",
                DohLtoNumber = "DOH-E2E-123",
                DohLtoExpiryDate = new DateOnly(2028, 6, 30),
                LtoEvidenceObjectKey = "tenants/tenant-e2e/lto/proof.pdf",
                PhilHealthAccreditationNumber = "PH-E2E-9",
                IsPhilHealthAccredited = true,
                SupportsInPerson = false,
                SupportsTeleconsult = true,
                SubmittedByClinicUserId = "user-e2e",
                SubmittedByDisplayName = "Dr. E2E Admin",
                UpdatedAtUtc = new DateTime(2026, 11, 19, 13, 0, 0, DateTimeKind.Utc),
                ExpectedRequestId = expectedRequestId
            };

            var facilityReply = await clinic.Client.RequestAsync<FacilityVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload>(
                InteropTypes.FacilityVerificationUpdateRequested,
                InteropTypes.FacilityVerificationUpdateResponded,
                clinicParty,
                Party.Portal,
                facilityRequest,
                TimeSpan.FromSeconds(5));

            facilityReply.Succeeded.Should().BeTrue();
            facilityReply.Conflict.Should().BeFalse();
            facilityReply.CurrentStatus.Should().Be("PendingReview");
            facilityReply.RequestId.Should().Be(expectedRequestId);
            recorder.FacilityRequests.Should().ContainSingle();
            recorder.FacilityRequests[0].Request.Should().BeEquivalentTo(facilityRequest);
            recorder.FacilityRequests[0].Context.From.Should().Be(clinicParty);

            var practitionerRequest = new PractitionerVerificationUpdateRequestedPayload
            {
                TenantId = "tenant-e2e",
                FacilityId = facilityId,
                FacilityName = "E2E Wellness Clinic",
                ClinicStaffMemberId = staffId,
                ProfessionKind = "Doctor",
                FirstName = "Liza",
                LastName = "Cruz",
                SubmittedPrcLicenseNo = "PRC-888999",
                NormalizedPrcLicenseNo = "0888999",
                PrcExpiryDate = new DateOnly(2029, 3, 1),
                PrcEvidenceObjectKey = "tenants/tenant-e2e/prc/liza.pdf",
                SubmittedByClinicUserId = "user-e2e",
                SubmittedByDisplayName = "Dr. E2E Admin",
                UpdatedAtUtc = new DateTime(2026, 11, 19, 13, 5, 0, DateTimeKind.Utc),
                ExpectedRequestId = expectedRequestId
            };

            var practitionerReply = await clinic.Client.RequestAsync<PractitionerVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload>(
                InteropTypes.PractitionerVerificationUpdateRequested,
                InteropTypes.PractitionerVerificationUpdateResponded,
                clinicParty,
                Party.Portal,
                practitionerRequest,
                TimeSpan.FromSeconds(5));

            practitionerReply.Succeeded.Should().BeFalse();
            practitionerReply.Conflict.Should().BeTrue();
            practitionerReply.ErrorCode.Should().Be("verification_request_not_pending");
            practitionerReply.CurrentStatus.Should().Be("Approved");
            practitionerReply.RequestId.Should().Be(expectedRequestId);
            recorder.PractitionerRequests.Should().ContainSingle();
            recorder.PractitionerRequests[0].Request.Should().BeEquivalentTo(practitionerRequest);
            recorder.PractitionerRequests[0].Context.From.Should().Be(clinicParty);

            hub.Sent.Should().HaveCount(4);
            hub.Sent[0].Type.Should().Be(InteropTypes.FacilityVerificationUpdateRequested);
            hub.Sent[1].Type.Should().Be(InteropTypes.FacilityVerificationUpdateResponded);
            hub.Sent[1].CorrelationId.Should().Be(hub.Sent[0].CorrelationId);
            hub.Sent[1].From.Should().Be(Party.Portal);
            hub.Sent[1].To.Should().Be(clinicParty);

            hub.Sent[2].Type.Should().Be(InteropTypes.PractitionerVerificationUpdateRequested);
            hub.Sent[3].Type.Should().Be(InteropTypes.PractitionerVerificationUpdateResponded);
            hub.Sent[3].CorrelationId.Should().Be(hub.Sent[2].CorrelationId);
            hub.Sent[3].From.Should().Be(Party.Portal);
            hub.Sent[3].To.Should().Be(clinicParty);
        }
        finally
        {
            stop.Cancel();
            await pump;
        }
    }
}
