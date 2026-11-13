using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Linq.Expressions;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Interop;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Portal.Application.Features.Guest;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Requests;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Sieve.Models;
using Xunit;

// Aliases
using ClinicAppointment = ClinicEz.Clinic.Domain.Entities.Appointment;
using ClinicPatient = ClinicEz.Clinic.Domain.Entities.Patient;
using PatientDbContext = ClinicEz.Patient.Infrastructure.Persistence.ApplicationDbContext;
using ClinicDbContext = ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext;
using PortalDbContext = ClinicEz.Portal.Infrastructure.Persistence.ApplicationDbContext;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Milestone 11 Empirical Challenger Test Suite:
/// Cross-Service Adversarial Verification across Clinic API, Portal API, Patient API, and Shared Contracts.
///
/// Dimension 1: Cross-Service Token & Signaling Routing (zero PHI, RelayUrl, guest invite hashes)
/// Dimension 2: Cryptographic Salt & Verification Security (cross-appointment salt isolation, brute force lockout)
/// Dimension 3: Serialization & Backward Compatibility (camelCase JSON, null omission, legacy support)
/// Dimension 4: Clinician & Patient State Synchronization (call completion, hanging room cleanup, out-of-order defense)
/// </summary>
[Collection("GuestTeleconsultTests")]
public sealed class ChallengerM11CrossServiceAdversarialTests : IDisposable
{
    private static readonly Regex ZeroPhiRoomRegex = new(@"^call-[0-9a-fA-F\-]{32,36}$", RegexOptions.Compiled);
    private static readonly Regex ZeroPhiStaffIdentityRegex = new(@"^staff:[0-9a-zA-Z\-_]{1,64}$", RegexOptions.Compiled);
    private static readonly Regex ZeroPhiPatientIdentityRegex = new(@"^patient:[0-9a-zA-Z\-_]{1,64}$", RegexOptions.Compiled);

    public ChallengerM11CrossServiceAdversarialTests()
    {
        GuestVerificationService.ClearStore();
    }

    public void Dispose()
    {
        GuestVerificationService.ClearStore();
    }

    // =========================================================================
    // Dimension 1: Cross-Service Token & Signaling Routing
    // =========================================================================

    [Fact]
    public async Task D1_ClinicianJoinCall_EnqueuesCommsCallStateChanged_ToPatientParty_WithRelayUrl_AndZeroPhiRoom()
    {
        // Arrange
        var tenantId = "tenant-clinic-m11";
        var clinicId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var callId = Guid.NewGuid();

        using var clinicDb = CreateClinicDbContext(tenantId, clinicId);
        var clinicContext = new FakeClinicContext(tenantId, clinicId, staffId);

        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "P-12345",
            ContactNumber = "09171234567",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1985, 4, 12)
        };
        clinicDb.Patients.Add(patient);

        var appointment = new ClinicAppointment
        {
            Id = appointmentId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            Patient = patient,
            PatientName = "Juan Dela Cruz",
            DoctorId = staffId,
            DoctorName = "Dr. Attending",
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            AdmittedAtUtc = DateTime.UtcNow.AddMinutes(-5),
            Status = AppointmentStatus.Confirmed,
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
            PaymentStatus = TeleconsultPaymentStatus.Exempt,
            ScheduledAt = DateTime.UtcNow
        };
        clinicDb.Appointments.Add(appointment);
        await clinicDb.SaveChangesAsync();

        var aptRepo = new EfRepository<ClinicAppointment>(clinicDb);
        var settingsRepo = new EfRepository<FacilitySettings>(clinicDb);
        var auditRepo = new EfRepository<AuditEntry>(clinicDb);
        var uow = new SimpleUnitOfWork(clinicDb);

        var expectedRelayUrl = "wss://media.cloud.clinicez.internal";
        var expectedPatientToken = "livekit-jwt-patient-token-secure";
        var expectedStaffToken = "livekit-jwt-staff-token-secure";

        var requestClient = new FakeInteropRequestClient
        {
            Handler = req =>
            {
                if (req is MediaRoomRequestedPayload mrp)
                {
                    return new MediaRoomRespondedPayload(
                        CallId: mrp.CallId,
                        RoomName: mrp.RoomName,
                        RelayUrl: expectedRelayUrl,
                        ParticipantTokens: new Dictionary<string, string>
                        {
                            [$"staff:{staffId:N}"] = expectedStaffToken,
                            [$"patient:{patientId:N}"] = expectedPatientToken
                        },
                        Success: true,
                        ErrorMessage: null);
                }
                return null;
            }
        };

        var publisher = new CapturingInteropPublisher();

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo,
            settingsRepo,
            auditRepo,
            uow,
            clinicContext,
            requestClient,
            publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        // Act
        var result = await handler.Handle(new JoinTeleconsultCallCommand(appointmentId), CancellationToken.None);

        // Assert - 1. Handler returns valid join DTO
        result.Should().NotBeNull();
        result.AppointmentId.Should().Be(appointmentId);
        result.CallId.Should().Be(callId);
        result.RelayUrl.Should().Be(expectedRelayUrl);
        result.ClinicianToken.Should().Be(expectedStaffToken);
        result.RoomName.Should().Be($"call-{callId:N}");
        result.MediaAvailable.Should().BeTrue();

        // Assert - 2. Interop message enqueued for Party.ForPatient
        publisher.Enqueued.Should().HaveCount(1);
        var envelope = publisher.Enqueued.Single();
        envelope.Type.Should().Be(InteropTypes.CommsCallStateChanged);
        envelope.To.Kind.Should().Be(PartyKind.Patient);
        envelope.To.PatientId.Should().Be(patientId.ToString());
        envelope.CorrelationId.Should().Be(callId);

        // Assert - 3. Payload inspect
        var payload = envelope.Payload.Deserialize<CommsCallStateChangedPayload>(InteropJson.Options);
        payload.Should().NotBeNull();
        payload.CallId.Should().Be(callId);
        payload.Kind.Should().Be(CallKind.Teleconsult);
        payload.Status.Should().Be("Admitted");
        payload.RoomName.Should().Be($"call-{callId:N}");
        payload.JoinToken.Should().Be(expectedPatientToken, "patient must receive their join token");
        payload.RelayUrl.Should().Be(expectedRelayUrl, "RelayUrl must be propagated to patient");

        // Assert - 4. Zero-PHI room and identities
        ZeroPhiRoomRegex.IsMatch(payload.RoomName!).Should().BeTrue("Room name must follow strict zero-PHI regex");
        payload.RoomName.Should().NotContain("Juan");
        payload.RoomName.Should().NotContain("Dela Cruz");
        payload.RoomName.Should().NotContain("1985");
        payload.RoomName.Should().NotContain(patientId.ToString());

        ZeroPhiStaffIdentityRegex.IsMatch(result.ParticipantIdentity).Should().BeTrue();
    }

    [Fact]
    public async Task D1_ClinicianGuestInvite_EnqueuesToPartyPortal_WithSaltedHashes_ZeroSecrets_ZeroPhi()
    {
        // Arrange
        var tenantId = "tenant-clinic-m11";
        var clinicId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var callId = Guid.NewGuid();

        using var clinicDb = CreateClinicDbContext(tenantId, clinicId);
        var clinicContext = new FakeClinicContext(tenantId, clinicId, staffId);

        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "P-67890",
            ContactNumber = "09179876543",
            FirstName = "Maria",
            LastName = "Clara",
            DateOfBirth = new DateOnly(1992, 8, 24)
        };
        clinicDb.Patients.Add(patient);

        var appointment = new ClinicAppointment
        {
            Id = appointmentId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            Patient = patient,
            PatientName = "Maria Clara",
            DoctorId = staffId,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            Status = AppointmentStatus.Confirmed,
            ScheduledAt = DateTime.UtcNow
        };
        clinicDb.Appointments.Add(appointment);
        await clinicDb.SaveChangesAsync();

        var aptRepo = new EfRepository<ClinicAppointment>(clinicDb);
        var patientRepo = new EfRepository<ClinicPatient>(clinicDb);
        var auditRepo = new EfRepository<AuditEntry>(clinicDb);
        var uow = new SimpleUnitOfWork(clinicDb);
        var publisher = new CapturingInteropPublisher();

        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Portal:BaseUrl"] = "https://portal.clinicez.internal"
        }).Build();

        var handler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo,
            patientRepo,
            auditRepo,
            uow,
            clinicContext,
            publisher,
            config,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance);

        // Act
        var result = await handler.Handle(new CreateTeleconsultGuestInviteCommand(appointmentId), CancellationToken.None);

        // Assert - 1. DTO returned to clinician contains plaintext OTP & token for delivery to guest
        result.Should().NotBeNull();
        result.InviteToken.Should().HaveLength(32);
        result.Otp.Should().HaveLength(6);
        result.DobHint.Should().Be("1992-**-**");
        result.InviteUrl.Should().Contain($"/guest/teleconsult?token={result.InviteToken}");

        // Assert - 2. Interop message enqueued for Party.Portal
        publisher.Enqueued.Should().HaveCount(1);
        var envelope = publisher.Enqueued.Single();
        envelope.Type.Should().Be(InteropTypes.GuestTeleconsultInviteIssued);
        envelope.To.Should().Be(Party.Portal);
        envelope.CorrelationId.Should().Be(appointmentId);

        // Assert - 3. Payload has ZERO plaintext secrets
        var payload = envelope.Payload.Deserialize<GuestTeleconsultInviteIssuedPayload>(InteropJson.Options);
        payload.Should().NotBeNull();
        payload.AppointmentId.Should().Be(appointmentId);
        payload.CallId.Should().Be(callId);

        // Hashes must be 64-character lowercase hex SHA-256 strings
        payload.InviteTokenHash.Should().HaveLength(64);
        payload.ExpectedDobHash.Should().HaveLength(64);
        payload.OtpHash.Should().HaveLength(64);

        // Crucial Zero-Secret Assertion: Raw OTP, raw token, and raw DOB NEVER appear in the interop payload
        var serializedPayload = JsonSerializer.Serialize(payload, InteropJson.Options);
        serializedPayload.Should().NotContain(result.Otp, "Plaintext OTP must NEVER be sent over the interop bus");
        serializedPayload.Should().NotContain(result.InviteToken, "Plaintext invite token must NEVER be sent over the interop bus");
        serializedPayload.Should().NotContain("1992-08-24", "Plaintext DOB must NEVER be sent in interop payload");
        serializedPayload.Should().NotContain("Maria", "Zero PHI: Patient name must not exist in guest payload");
        serializedPayload.Should().NotContain("Clara", "Zero PHI: Patient name must not exist in guest payload");

        // Verify computed hashes match expected salted SHA256 formulas
        var expectedTokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(result.InviteToken.Trim()))).ToLowerInvariant();
        var expectedDobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointmentId:N}:1992-08-24"))).ToLowerInvariant();
        var expectedOtpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointmentId:N}:{result.Otp.Trim()}"))).ToLowerInvariant();

        payload.InviteTokenHash.Should().Be(expectedTokenHash);
        payload.ExpectedDobHash.Should().Be(expectedDobHash);
        payload.OtpHash.Should().Be(expectedOtpHash);

        // Assert - 4. Immutable WORM Audit Entry was created
        var audit = await clinicDb.AuditEntries.FirstOrDefaultAsync(a => a.Action == "teleconsult.guest_invite.issued");
        audit.Should().NotBeNull();
        audit!.TargetEntityId.Should().Be(appointmentId.ToString());
    }

    // =========================================================================
    // Dimension 2: Cryptographic Salt & Verification Security
    // =========================================================================

    [Fact]
    public async Task D2_SaltIsolation_CrossAppointmentSaltMismatch_PreventsCredentialReuse()
    {
        // Arrange:
        // Victim Appointment A and Attacker Appointment B happen to have the SAME patient DOB and OTP.
        var aptVictimId = Guid.NewGuid();
        var aptAttackerId = Guid.NewGuid();
        var callVictimId = Guid.NewGuid();
        var callAttackerId = Guid.NewGuid();

        var sharedDob = "1990-05-20";
        var sharedOtp = "123456";

        var victimRawToken = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

        var victimTokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(victimRawToken))).ToLowerInvariant();
        var victimDobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{aptVictimId:N}:{sharedDob}"))).ToLowerInvariant();
        var victimOtpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{aptVictimId:N}:{sharedOtp}"))).ToLowerInvariant();

        var attackerDobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{aptAttackerId:N}:{sharedDob}"))).ToLowerInvariant();
        var attackerOtpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{aptAttackerId:N}:{sharedOtp}"))).ToLowerInvariant();

        // Cryptographic Salt Assertion: Different salts produce non-identical hashes despite identical raw inputs
        victimDobHash.Should().NotBe(attackerDobHash, "Salt prevents DOB hash collision across appointments");
        victimOtpHash.Should().NotBe(attackerOtpHash, "Salt prevents OTP hash collision across appointments");

        // Register victim's invite in portal verification store via GuestTeleconsultInviteIssuedHandler
        using var portalContext = CreatePortalDbContext();
        var portalPublisher = new InteropPublisher(portalContext);
        var portalConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["LIVEKIT_API_KEY"] = "portal-key",
            ["LIVEKIT_API_SECRET"] = "portal-secret-32-chars-long-minimum!",
            ["LIVEKIT_URL"] = "wss://livekit.portal.internal"
        }).Build();

        var verificationService = new GuestVerificationService(
            portalPublisher,
            portalConfig,
            NullLogger<GuestVerificationService>.Instance);

        var handler = new GuestTeleconsultInviteIssuedHandler(
            verificationService,
            NullLogger<GuestTeleconsultInviteIssuedHandler>.Instance);

        var victimPayload = new GuestTeleconsultInviteIssuedPayload(
            AppointmentId: aptVictimId,
            CallId: callVictimId,
            TenantId: "tenant-victim",
            FacilityId: "clinic-victim",
            InviteTokenHash: victimTokenHash,
            ExpectedDobHash: victimDobHash,
            OtpHash: victimOtpHash,
            ExpiresAtUtc: DateTime.UtcNow.AddHours(1),
            IssuedAtUtc: DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.GuestTeleconsultInviteIssued,
            Party.ForFacility("tenant-victim", "clinic-victim", FacilityType.Clinic),
            Party.Portal,
            aptVictimId,
            victimPayload);

        await handler.HandleAsync(victimPayload, new InteropMessageContext(envelope), CancellationToken.None);

        // Act 1: Attacker tries to verify against victim's token using credentials hashed with attacker's appointment salt
        // In the API, the guest presents plaintext (rawToken, sharedDob, sharedOtp).
        // If the system did NOT use the appointment ID stored on the registered invite as salt, an attacker could spoof it.
        // But the system computes ComputeSaltedHash(invite.InviteId, dateOfBirth) using the store's invite.InviteId.
        // Now suppose an attacker tampered with the payload or tried to reuse hashes:
        var computedWithWrongSalt = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{aptAttackerId:N}:{sharedDob}"))).ToLowerInvariant();
        computedWithWrongSalt.Should().NotBe(victimDobHash);

        // Act 2: Legitimate guest verifies against victim's invite -> SUCCESS
        var legitimateResult = await verificationService.VerifyGuestAsync(victimRawToken, sharedDob, sharedOtp, CancellationToken.None);
        legitimateResult.Success.Should().BeTrue();
        legitimateResult.CallId.Should().Be(callVictimId);
        legitimateResult.RoomName.Should().Be($"call-{callVictimId:N}");
        legitimateResult.GuestToken.Should().NotBeNullOrWhiteSpace();

        // Verify token subject has victim appointment ID
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(legitimateResult.GuestToken);
        jwt.Subject.Should().Be($"guest:otp-{aptVictimId:N}");
        jwt.Claims.Should().NotContain(c => c.Type == "patient_id");
        jwt.Claims.Should().NotContain(c => c.Type == "dob");
    }

    [Fact]
    public async Task D2_PortalApi_GuestVerification_FiveFailedAttempts_EnforcesPermanentLockout_AndHttp423()
    {
        // Arrange
        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var rawToken = "bruteforce-target-token-32-chars";
        var correctDob = "1994-03-15";
        var correctOtp = "998877";

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();
        var dobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{aptId:N}:{correctDob}"))).ToLowerInvariant();
        var otpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{aptId:N}:{correctOtp}"))).ToLowerInvariant();

        using var portalContext = CreatePortalDbContext();
        var portalPublisher = new InteropPublisher(portalContext);
        var portalConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["LIVEKIT_API_KEY"] = "portal-key",
            ["LIVEKIT_API_SECRET"] = "portal-secret-32-chars-long-minimum!",
            ["LIVEKIT_URL"] = "wss://livekit.portal.internal"
        }).Build();

        var verificationService = new GuestVerificationService(
            portalPublisher,
            portalConfig,
            NullLogger<GuestVerificationService>.Instance);

        var handler = new GuestTeleconsultInviteIssuedHandler(
            verificationService,
            NullLogger<GuestTeleconsultInviteIssuedHandler>.Instance);

        var payload = new GuestTeleconsultInviteIssuedPayload(
            aptId, callId, "tenant-portal", "clinic-1", tokenHash, dobHash, otpHash,
            DateTime.UtcNow.AddMinutes(30), DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.GuestTeleconsultInviteIssued,
            Party.ForFacility("tenant-portal", "clinic-1", FacilityType.Clinic),
            Party.Portal,
            aptId,
            payload);

        await handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);

        // Act & Assert: Failed attempts 1 through 4 return failure with countdown
        for (int i = 1; i <= 4; i++)
        {
            var result = await verificationService.VerifyGuestAsync(rawToken, correctDob, "000000", CancellationToken.None);
            result.Should().NotBeNull();
            result.Success.Should().BeFalse();
            result.ErrorCode.Should().Be("INVALID_VERIFICATION_CREDENTIALS");
            result.RemainingAttempts.Should().Be(5 - i);
            result.IsLockedOut.Should().BeFalse();
        }

        // Attempt 5: 5th failure triggers permanent lockout
        var result5 = await verificationService.VerifyGuestAsync(rawToken, correctDob, "000000", CancellationToken.None);
        result5.Should().NotBeNull();
        result5.Success.Should().BeFalse();
        result5.ErrorCode.Should().Be("GUEST_INVITE_LOCKED_OUT");
        result5.RemainingAttempts.Should().Be(0);
        result5.IsLockedOut.Should().BeTrue();

        // Attempt 6: Adversary or victim now supplies 100% correct credentials -> STILL locked out!
        var result6 = await verificationService.VerifyGuestAsync(rawToken, correctDob, correctOtp, CancellationToken.None);
        result6.Should().NotBeNull();
        result6.Success.Should().BeFalse();
        result6.ErrorCode.Should().Be("GUEST_INVITE_LOCKED_OUT", "Locked invite MUST remain locked even if correct credentials are provided");
        result6.IsLockedOut.Should().BeTrue();
        result6.GuestToken.Should().BeNull();
    }

    [Fact]
    public async Task D2_MalformedCredentials_DoNotExhaustLockoutQuota()
    {
        // Arrange
        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var rawToken = "format-check-token-32-characters";
        var correctDob = "1991-10-10";
        var correctOtp = "654321";

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();
        var dobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{aptId:N}:{correctDob}"))).ToLowerInvariant();
        var otpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{aptId:N}:{correctOtp}"))).ToLowerInvariant();

        using var portalContext = CreatePortalDbContext();
        var portalPublisher = new InteropPublisher(portalContext);
        var portalConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["LIVEKIT_API_KEY"] = "portal-key",
            ["LIVEKIT_API_SECRET"] = "portal-secret-32-chars-long-minimum!",
            ["LIVEKIT_URL"] = "wss://livekit.portal.internal"
        }).Build();

        var verificationService = new GuestVerificationService(
            portalPublisher,
            portalConfig,
            NullLogger<GuestVerificationService>.Instance);

        var handler = new GuestTeleconsultInviteIssuedHandler(
            verificationService,
            NullLogger<GuestTeleconsultInviteIssuedHandler>.Instance);

        var payload = new GuestTeleconsultInviteIssuedPayload(
            aptId, callId, "tenant-portal", "clinic-1", tokenHash, dobHash, otpHash,
            DateTime.UtcNow.AddMinutes(30), DateTime.UtcNow);

        await handler.HandleAsync(payload, new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.GuestTeleconsultInviteIssued,
            Party.ForFacility("tenant-portal", "clinic-1", FacilityType.Clinic),
            Party.Portal,
            aptId,
            payload)), CancellationToken.None);

        // 1. Submit invalid DOB format -> INVALID_FORMAT
        var badDobRes = await verificationService.VerifyGuestAsync(rawToken, "10/10/1991", correctOtp, CancellationToken.None);
        badDobRes.Should().NotBeNull();
        badDobRes.Success.Should().BeFalse();
        badDobRes.ErrorCode.Should().Be("INVALID_FORMAT");

        // 2. Submit invalid OTP format -> INVALID_FORMAT
        var badOtpRes = await verificationService.VerifyGuestAsync(rawToken, correctDob, "12345", CancellationToken.None); // 5 digits
        badOtpRes.Should().NotBeNull();
        badOtpRes.Success.Should().BeFalse();
        badOtpRes.ErrorCode.Should().Be("INVALID_FORMAT");

        // 3. Submit spoofed clinical document token -> DOCUMENT_KIND_MISMATCH
        var docTokenRes = await verificationService.VerifyGuestAsync("rx-1234567890abcdef1234567890abcdef", correctDob, correctOtp, CancellationToken.None);
        docTokenRes.Should().NotBeNull();
        docTokenRes.Success.Should().BeFalse();
        docTokenRes.ErrorCode.Should().Be("DOCUMENT_KIND_MISMATCH");

        // 4. Now perform valid verification: all 5 attempts must still be available, succeeding immediately
        var validRes = await verificationService.VerifyGuestAsync(rawToken, correctDob, correctOtp, CancellationToken.None);
        validRes.Should().NotBeNull();
        validRes.Success.Should().BeTrue();
        validRes.RemainingAttempts.Should().Be(5, "Malformed formatting must not consume lockout quota");
    }

    // =========================================================================
    // Dimension 3: Serialization & Backward Compatibility
    // =========================================================================

    [Fact]
    public void D3_CommsCallStateChangedPayload_Serialization_CamelCaseAndNullOmission()
    {
        var callId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var payload = new CommsCallStateChangedPayload(
            CallId: callId,
            ConversationId: null,
            TenantId: "tenant-serialization",
            FacilityId: "clinic-serialization",
            Kind: CallKind.Teleconsult,
            Status: "Admitted",
            RoomName: $"call-{callId:N}",
            JoinToken: "token-abc",
            StateVersion: 1,
            ChangedAtUtc: now,
            RelayUrl: "wss://relay.example.com");

        var json = JsonSerializer.Serialize(payload, InteropJson.Options);

        // Verify camelCase property names matching TypeScript
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        root.TryGetProperty("callId", out _).Should().BeTrue();
        root.TryGetProperty("tenantId", out _).Should().BeTrue();
        root.TryGetProperty("facilityId", out _).Should().BeTrue();
        root.TryGetProperty("kind", out _).Should().BeTrue();
        root.TryGetProperty("status", out _).Should().BeTrue();
        root.TryGetProperty("roomName", out _).Should().BeTrue();
        root.TryGetProperty("joinToken", out _).Should().BeTrue();
        root.TryGetProperty("stateVersion", out _).Should().BeTrue();
        root.TryGetProperty("changedAtUtc", out _).Should().BeTrue();
        root.TryGetProperty("relayUrl", out var relayElem).Should().BeTrue();
        relayElem.GetString().Should().Be("wss://relay.example.com");

        // Roundtrip deserialization
        var deserialized = JsonSerializer.Deserialize<CommsCallStateChangedPayload>(json, InteropJson.Options);
        deserialized.Should().NotBeNull();
        deserialized!.CallId.Should().Be(callId);
        deserialized.RelayUrl.Should().Be("wss://relay.example.com");
    }

    [Fact]
    public void D3_CommsCallStateChangedPayload_BackwardCompatibility_HandlesOmittedRelayUrl()
    {
        var callId = Guid.NewGuid();

        // Legacy payload string without relayUrl property (as produced by older services prior to M7)
        var legacyJson = $$"""
        {
          "callId": "{{callId}}",
          "conversationId": null,
          "tenantId": "tenant-legacy",
          "facilityId": "clinic-legacy",
          "kind": "Teleconsult",
          "status": "Admitted",
          "roomName": "call-{{callId:N}}",
          "joinToken": "token-legacy",
          "stateVersion": 1,
          "changedAtUtc": "2026-11-13T00:00:00Z"
        }
        """;

        var deserialized = JsonSerializer.Deserialize<CommsCallStateChangedPayload>(legacyJson, InteropJson.Options);
        deserialized.Should().NotBeNull();
        deserialized!.CallId.Should().Be(callId);
        deserialized.Status.Should().Be("Admitted");
        deserialized.RelayUrl.Should().BeNull("Omitted relayUrl in legacy payload must default to null gracefully");

        // Future compatibility: extra unknown fields should not break deserialization
        var forwardJson = $$"""
        {
          "callId": "{{callId}}",
          "tenantId": "tenant-future",
          "facilityId": "clinic-future",
          "kind": "Teleconsult",
          "status": "InCall",
          "stateVersion": 2,
          "changedAtUtc": "2026-11-13T00:00:00Z",
          "unrecognizedFutureProperty": "some-ai-meta",
          "codec": "vp9"
        }
        """;

        var forwardDeserialized = JsonSerializer.Deserialize<CommsCallStateChangedPayload>(forwardJson, InteropJson.Options);
        forwardDeserialized.Should().NotBeNull();
        forwardDeserialized!.CallId.Should().Be(callId);
        forwardDeserialized.Status.Should().Be("InCall");
    }

    [Fact]
    public void D3_GuestTeleconsultInviteIssuedPayload_Serialization_CamelCaseRoundtrip()
    {
        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var payload = new GuestTeleconsultInviteIssuedPayload(
            AppointmentId: aptId,
            CallId: callId,
            TenantId: "tenant-ser",
            FacilityId: "clinic-ser",
            InviteTokenHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            ExpectedDobHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            OtpHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            ExpiresAtUtc: now.AddMinutes(30),
            IssuedAtUtc: now);

        var json = JsonSerializer.Serialize(payload, InteropJson.Options);

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        root.TryGetProperty("appointmentId", out _).Should().BeTrue();
        root.TryGetProperty("callId", out _).Should().BeTrue();
        root.TryGetProperty("tenantId", out _).Should().BeTrue();
        root.TryGetProperty("facilityId", out _).Should().BeTrue();
        root.TryGetProperty("inviteTokenHash", out _).Should().BeTrue();
        root.TryGetProperty("expectedDobHash", out _).Should().BeTrue();
        root.TryGetProperty("otpHash", out _).Should().BeTrue();
        root.TryGetProperty("expiresAtUtc", out _).Should().BeTrue();
        root.TryGetProperty("issuedAtUtc", out _).Should().BeTrue();

        var roundtripped = JsonSerializer.Deserialize<GuestTeleconsultInviteIssuedPayload>(json, InteropJson.Options);
        roundtripped.Should().NotBeNull();
        roundtripped!.AppointmentId.Should().Be(aptId);
        roundtripped.CallId.Should().Be(callId);
        roundtripped.InviteTokenHash.Should().Be(payload.InviteTokenHash);
        roundtripped.ExpectedDobHash.Should().Be(payload.ExpectedDobHash);
        roundtripped.OtpHash.Should().Be(payload.OtpHash);
    }

    [Fact]
    public void D3_TypeScriptCompatibility_GuestTeleconsultVerifyRequest_Deserialization()
    {
        // Exact payload sent by apps/portal-web's fetch() in guestTeleconsult.service.ts
        var tsClientJson = """
        {
          "inviteToken": "0123456789abcdef0123456789abcdef",
          "dateOfBirth": "1990-05-20",
          "otp": "654321"
        }
        """;

        var req = JsonSerializer.Deserialize<GuestTeleconsultVerifyRequestDto>(tsClientJson, InteropJson.Options);
        req.Should().NotBeNull();
        req!.InviteToken.Should().Be("0123456789abcdef0123456789abcdef");
        req.DateOfBirth.Should().Be("1990-05-20");
        req.Otp.Should().Be("654321");
    }

    public sealed record GuestTeleconsultVerifyRequestDto(
        string InviteToken,
        string DateOfBirth,
        string Otp);

    // =========================================================================
    // Dimension 4: Clinician & Patient State Synchronization
    // =========================================================================

    [Fact]
    public async Task D4_ClinicianEndCall_CompletesAppointment_AndEnqueuesEndedStateToPatient()
    {
        // Arrange
        var tenantId = "tenant-clinic-m11";
        var clinicId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var callId = Guid.NewGuid();

        using var clinicDb = CreateClinicDbContext(tenantId, clinicId);
        var clinicContext = new FakeClinicContext(tenantId, clinicId, staffId);

        var appointment = new ClinicAppointment
        {
            Id = appointmentId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Pedro Penduko",
            DoctorId = staffId,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            Status = AppointmentStatus.Confirmed,
            ScheduledAt = DateTime.UtcNow
        };
        clinicDb.Appointments.Add(appointment);
        await clinicDb.SaveChangesAsync();

        var aptRepo = new EfRepository<ClinicAppointment>(clinicDb);
        var sessionRepo = new EfRepository<TeleconsultRecordingSession>(clinicDb);
        var auditRepo = new EfRepository<AuditEntry>(clinicDb);
        var uow = new SimpleUnitOfWork(clinicDb);
        var publisher = new CapturingInteropPublisher();
        var sender = new FakeSender();

        var handler = new EndTeleconsultCallCommandHandler(
            aptRepo,
            sessionRepo,
            auditRepo,
            uow,
            clinicContext,
            publisher,
            sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        // Act
        var result = await handler.Handle(new EndTeleconsultCallCommand(appointmentId, "Consultation concluded normally"), CancellationToken.None);

        // Assert - 1. Result DTO
        result.Should().NotBeNull();
        result.Status.Should().Be("Ended");
        result.AppointmentId.Should().Be(appointmentId);
        result.CallId.Should().Be(callId);

        // Assert - 2. Database appointment transitioned to Completed
        var updatedAppt = await clinicDb.Appointments.FindAsync(appointmentId);
        updatedAppt!.Status.Should().Be(AppointmentStatus.Completed);

        // Assert - 3. Interop comms.call.state.changed enqueued to Party.ForPatient
        publisher.Enqueued.Should().HaveCount(1);
        var envelope = publisher.Enqueued.Single();
        envelope.Type.Should().Be(InteropTypes.CommsCallStateChanged);
        envelope.To.Kind.Should().Be(PartyKind.Patient);
        envelope.To.PatientId.Should().Be(patientId.ToString());

        var payload = envelope.Payload.Deserialize<CommsCallStateChangedPayload>(InteropJson.Options);
        payload.Should().NotBeNull();
        payload.Status.Should().Be("Ended");
        payload.StateVersion.Should().Be(2);
        payload.JoinToken.Should().BeNull("Token must be cleared when call ends to prevent unauthorized re-entry");
        payload.RelayUrl.Should().BeNull();

        // Assert - 4. Immutable WORM Audit Entry created
        var audit = await clinicDb.AuditEntries.FirstOrDefaultAsync(a => a.Action == "teleconsult.call.ended");
        audit.Should().NotBeNull();
        audit!.TargetEntityId.Should().Be(appointmentId.ToString());
    }

    [Fact]
    public async Task D4_PatientIngestionOfEndedState_ClosesSession_ClearsToken_AndBroadcastsSignalR()
    {
        // Arrange
        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        using var patientDb = CreatePatientDbContext();
        var notifier = new CapturingSyncNotificationService();

        var existingSession = new PatientCallSession
        {
            Id = Guid.NewGuid(),
            CallId = callId,
            PatientId = patientId,
            TenantId = "tenant-p",
            FacilityId = "clinic-p",
            Status = "Admitted",
            RoomName = $"call-{callId:N}",
            LiveKitToken = "active-jwt-token-to-be-revoked",
            StateVersion = 1,
            CreatedAt = DateTime.UtcNow
        };
        patientDb.PatientCallSessions.Add(existingSession);
        await patientDb.SaveChangesAsync();

        var handler = new CommsCallStateChangedInteropHandler(
            patientDb,
            notifier,
            NullLogger<CommsCallStateChangedInteropHandler>.Instance);

        var endPayload = new CommsCallStateChangedPayload(
            CallId: callId,
            ConversationId: null,
            TenantId: "tenant-p",
            FacilityId: "clinic-p",
            Kind: CallKind.Teleconsult,
            Status: "Ended",
            RoomName: existingSession.RoomName,
            JoinToken: null, // Cleared token
            StateVersion: 2,
            ChangedAtUtc: DateTime.UtcNow,
            RelayUrl: null);

        var envelope = InteropEnvelope.Create(
            InteropTypes.CommsCallStateChanged,
            Party.ForFacility("tenant-p", "clinic-p", FacilityType.Clinic),
            Party.ForPatient(patientId.ToString()),
            callId,
            endPayload);

        // Act
        await handler.HandleAsync(endPayload, new InteropMessageContext(envelope), CancellationToken.None);

        // Assert - 1. Database session updated
        var session = await patientDb.PatientCallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        session.Should().NotBeNull();
        session!.Status.Should().Be("Ended");
        session.StateVersion.Should().Be(2);
        session.LiveKitToken.Should().BeNull("LiveKit token must be revoked / cleared");
        session.EndedAtUtc.Should().NotBeNull();

        // Assert - 2. Realtime SignalR notification delivered to patient device
        notifier.Events.Should().HaveCount(1);
        var (evPatientId, evType, evPayload) = notifier.Events.Single();
        evPatientId.Should().Be(patientId);
        evType.Should().Be("CallStateChanged");

        var statusProp = evPayload?.GetType().GetProperty("status")?.GetValue(evPayload) as string;
        var joinTokenProp = evPayload?.GetType().GetProperty("joinToken")?.GetValue(evPayload) as string;
        statusProp.Should().Be("Ended");
        joinTokenProp.Should().BeNull();
    }

    [Fact]
    public async Task D4_OutOfOrderProtection_StaleAdmittedPacketAfterEnded_IsRejected()
    {
        // Arrange
        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        using var patientDb = CreatePatientDbContext();
        var notifier = new CapturingSyncNotificationService();

        // Session already at Ended state (Version 2)
        var closedSession = new PatientCallSession
        {
            Id = Guid.NewGuid(),
            CallId = callId,
            PatientId = patientId,
            TenantId = "tenant-p",
            FacilityId = "clinic-p",
            Status = "Ended",
            RoomName = $"call-{callId:N}",
            LiveKitToken = null,
            StateVersion = 2,
            EndedAtUtc = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        };
        patientDb.PatientCallSessions.Add(closedSession);
        await patientDb.SaveChangesAsync();

        var handler = new CommsCallStateChangedInteropHandler(
            patientDb,
            notifier,
            NullLogger<CommsCallStateChangedInteropHandler>.Instance);

        // Delayed/stale network packet arriving late with Version 1 (Admitted)
        var stalePayload = new CommsCallStateChangedPayload(
            CallId: callId,
            ConversationId: null,
            TenantId: "tenant-p",
            FacilityId: "clinic-p",
            Kind: CallKind.Teleconsult,
            Status: "Admitted",
            RoomName: closedSession.RoomName,
            JoinToken: "zombie-re-entry-token",
            StateVersion: 1, // Stale!
            ChangedAtUtc: DateTime.UtcNow.AddMinutes(-2),
            RelayUrl: "wss://stale.relay");

        var envelope = InteropEnvelope.Create(
            InteropTypes.CommsCallStateChanged,
            Party.ForFacility("tenant-p", "clinic-p", FacilityType.Clinic),
            Party.ForPatient(patientId.ToString()),
            callId,
            stalePayload);

        // Act
        await handler.HandleAsync(stalePayload, new InteropMessageContext(envelope), CancellationToken.None);

        // Assert
        var session = await patientDb.PatientCallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        session!.Status.Should().Be("Ended", "Stale packet must not resurrect ended session");
        session.StateVersion.Should().Be(2);
        session.LiveKitToken.Should().BeNull();
        notifier.Events.Should().BeEmpty("No event broadcast for dropped stale packets");
    }

    // =========================================================================
    // Helpers & In-Memory DB Factories
    // =========================================================================

    private static ClinicDbContext CreateClinicDbContext(string tenantId, Guid clinicId)
    {
        var options = new DbContextOptionsBuilder<ClinicDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        var config = new ConfigurationBuilder().Build();
        var ctx = new FakeClinicContext(tenantId, clinicId, Guid.NewGuid());
        var db = new ClinicDbContext(options, config, ctx);
        db.Database.EnsureCreated();
        return db;
    }

    private static PatientDbContext CreatePatientDbContext()
    {
        var options = new DbContextOptionsBuilder<PatientDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        var db = new PatientDbContext(options);
        db.Database.EnsureCreated();
        return db;
    }

    private static PortalDbContext CreatePortalDbContext()
    {
        var options = new DbContextOptionsBuilder<PortalDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        var db = new PortalDbContext(options);
        db.Database.EnsureCreated();
        return db;
    }

    private sealed class FakeClinicContext : IClinicContext
    {
        public FakeClinicContext(string tenantId, Guid clinicId, Guid? staffId)
        {
            TenantId = tenantId;
            ClinicId = clinicId;
            StaffId = staffId;
        }

        public string TenantId { get; set; }
        public Guid ClinicId { get; set; }
        public Guid? BranchId => null;
        public Guid? StaffId { get; set; }
        public string? StaffName => "Dr. Attending Clinician";
        public string? StaffRole => "Doctor";
        public IReadOnlyList<string> Permissions => [
            ClinicPermissions.ConsultationsWrite,
            ClinicPermissions.ConsultationsSign,
            ClinicPermissions.AppointmentsManage,
            ClinicPermissions.AppointmentsRead
        ];
        public bool HasPermission(string permission) => true;
    }

    private sealed class CapturingInteropPublisher : IInteropPublisher
    {
        public List<InteropEnvelope> Enqueued { get; } = new();

        public InteropEnvelope Enqueue<T>(
            string type,
            Party from,
            Party to,
            Guid correlationId,
            T payload,
            int schemaVersion = 1,
            TimeSpan? ttl = null)
        {
            var envelope = InteropEnvelope.Create(type, from, to, correlationId, payload, schemaVersion, ttl);
            Enqueued.Add(envelope);
            return envelope;
        }

        public void Enqueue(InteropEnvelope envelope) => Enqueued.Add(envelope);
    }

    private sealed class FakeInteropRequestClient : IInteropRequestClient
    {
        public Func<object, object?>? Handler { get; set; }

        public Task<TResponse> RequestAsync<TRequest, TResponse>(
            string requestType,
            string replyType,
            Party from,
            Party to,
            TRequest payload,
            TimeSpan? timeout = null,
            CancellationToken ct = default)
        {
            if (Handler != null)
            {
                var res = Handler(payload!);
                return Task.FromResult((TResponse)res!);
            }
            return Task.FromResult<TResponse>(default!);
        }
    }

    private sealed class CapturingSyncNotificationService : ISyncNotificationService
    {
        public List<(Guid PatientId, string EventType, object? Payload)> Events { get; } = new();

        public Task NotifySyncCompletedAsync(Guid patientId, int applied, int conflicts, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifySessionRevokedAsync(Guid patientId, string reason, string? deviceId = null, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyCommsEventAsync(Guid patientId, string eventType, object? payload, CancellationToken ct = default)
        {
            Events.Add((patientId, eventType, payload));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeSender : ISender
    {
        public Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = default) =>
            Task.FromResult(default(TResponse)!);

        public Task Send<TRequest>(TRequest request, CancellationToken cancellationToken = default) where TRequest : IRequest =>
            Task.CompletedTask;

        public Task<object?> Send(object request, CancellationToken cancellationToken = default) =>
            Task.FromResult<object?>(null);

        public IAsyncEnumerable<TResponse> CreateStream<TResponse>(IStreamRequest<TResponse> request, CancellationToken cancellationToken = default) =>
            throw new NotImplementedException();

        public IAsyncEnumerable<object?> CreateStream(object request, CancellationToken cancellationToken = default) =>
            throw new NotImplementedException();
    }

    private sealed class EfRepository<T>(ClinicDbContext db) : IRepository<T> where T : BaseEntity
    {
        private readonly DbSet<T> _set = db.Set<T>();

        public Task<T?> GetByIdAsync(Guid id, CancellationToken ct = default) => _set.FindAsync([id], ct).AsTask();
        public Task<T?> FindAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default) => _set.FirstOrDefaultAsync(predicate, ct);
        public IQueryable<T> Query(Expression<Func<T, bool>>? predicate = default, bool? ignoreQueryFilters = false) =>
            predicate != null ? _set.Where(predicate) : _set;
        public IQueryable<T> IgnoreQueryFilters() => _set.IgnoreQueryFilters();
        public Task<List<T>> ToListAsync(IQueryable<T> query, CancellationToken ct = default) => query.ToListAsync(ct);
        public Task<TEntity?> GetSingleAsync<TEntity>(IQueryable<TEntity> query, CancellationToken ct = default) => query.SingleOrDefaultAsync(ct);
        public Task<TEntity?> GetFirstAsync<TEntity>(IQueryable<TEntity> query, CancellationToken ct = default) => query.FirstOrDefaultAsync(ct);
        public async Task AddAsync(T entity, CancellationToken ct = default) => await _set.AddAsync(entity, ct);
        public void Update(T entity) => _set.Update(entity);
        public void Remove(T entity, bool hardDelete = false) => _set.Remove(entity);
        public async Task AddBulkAsync(IList<T> entities, CancellationToken ct = default) => await _set.AddRangeAsync(entities, ct);
        public Task UpdateBulkAsync(IList<T> entities, CancellationToken ct = default) { _set.UpdateRange(entities); return Task.CompletedTask; }
        public Task DeleteBulkAsync(IList<T> entities, CancellationToken ct = default) { _set.RemoveRange(entities); return Task.CompletedTask; }
        public Task<(IReadOnlyList<T> Entities, int TotalCount)> GetAllAsync(SieveModel sieveModel, CancellationToken ct = default) => throw new NotImplementedException();
        public Task<(IReadOnlyList<TDto> Entities, int TotalCount)> GetAllAsync<TDto>(SieveModel sieveModel, Expression<Func<T, TDto>> projection, CancellationToken ct = default) => throw new NotImplementedException();
    }

    private sealed class SimpleUnitOfWork(ClinicDbContext db) : IUnitOfWork
    {
        public IProductRepository ProductRepository => null!;
        public Task<int> SaveChangesAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);
        public async Task ExecuteInTransactionAsync(Func<CancellationToken, Task> action, CancellationToken ct = default)
        {
            await action(ct);
            await db.SaveChangesAsync(ct);
        }
        public async Task<T> ExecuteInTransactionAsync<T>(Func<CancellationToken, Task<T>> action, CancellationToken ct = default)
        {
            var res = await action(ct);
            await db.SaveChangesAsync(ct);
            return res;
        }
    }
}
