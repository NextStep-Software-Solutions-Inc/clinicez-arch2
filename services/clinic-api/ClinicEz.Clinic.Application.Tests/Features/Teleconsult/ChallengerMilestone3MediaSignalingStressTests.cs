using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Messaging.Handlers;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Requests;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Teleconsult;

/// <summary>
/// Empirical Adversarial Verification Harness for Milestone 3 (Media Signaling & Vault Recording Encryption).
/// Covers:
/// 1. Zero-PHI Room & Participant Regex Boundaries and Injection Attacks.
/// 2. 10-Second Interop Timeout, Network Faults, and Offline Signaling Fallback.
/// 3. Admission Gate & Prepayment Strict Enforcement Matrix.
/// 4. Call Termination, Auto-Finalization Resilience, and Concurrency Idempotency.
/// 5. Consultation Linkage Collision Defense & Chain of Custody Integrity.
/// 6. Vault Playback Ticket Tampering and Sidecar Retention Resiliency.
/// </summary>
public sealed class ChallengerMilestone3MediaSignalingStressTests
{
    private static readonly Regex ZeroPhiRoomRegex = new(@"^call-[0-9a-fA-F\-]{32,36}$", RegexOptions.Compiled);
    private static readonly Regex ZeroPhiParticipantRegex = new(@"^(staff|patient|guest|participant)(:|-)[0-9a-zA-Z\-_]{1,64}$", RegexOptions.Compiled);

    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-challenger-m3";
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;

    public ChallengerMilestone3MediaSignalingStressTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
        _clinicContext.StaffName.Returns("Dr. Challenger M3");
        _clinicContext.StaffRole.Returns("Doctor");
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsRead).Returns(true);
    }

    // =========================================================================
    // FOCUS 1: ZERO-PHI BOUNDARIES & ADVERSARIAL INJECTION STRESS TESTS
    // =========================================================================

    [Theory]
    [InlineData("call-0123456789abcdef0123456789abcdef", true)] // 32 hex lowercase
    [InlineData("call-0123456789ABCDEF0123456789ABCDEF", true)] // 32 hex uppercase
    [InlineData("call-12345678-1234-1234-1234-123456789abc", true)] // 36 char GUID with hyphens
    [InlineData("call-12345678-1234-1234-1234-123456789ABC", true)] // 36 char GUID uppercase
    [InlineData("call-0123456789abcdef0123456789abcde", false)] // 31 chars (under minimum)
    [InlineData("call-0123456789abcdef0123456789abcdef00000", false)] // 37 chars (exceeds maximum 36)
    [InlineData("call-juan-delacruz", false)] // Patient name injection
    [InlineData("call-patient.email@domain.com", false)] // Email injection
    [InlineData("call-12345678-1234-1234-1234-123456789abc!", false)] // Special char '!'
    [InlineData("call-12345678\n1234-1234-1234-123456789abc", false)] // Embedded newline
    [InlineData("room-12345678-1234-1234-1234-123456789abc", false)] // Wrong prefix 'room-'
    [InlineData("call_12345678123412341234123456789abc", false)] // Underscore in prefix
    [InlineData("call-12345678 1234 1234 1234 123456789abc", false)] // Spaces
    [InlineData("call-🩺-12345678123412341234123456789abc", false)] // Emoji
    [InlineData("call-ñáéíóú-123456781234123412341234", false)] // Non-ASCII Unicode
    [InlineData("call-../../etc/passwd/123456789012345", false)] // Path traversal attempt
    [InlineData("call-';DROP TABLE appointments;--1234", false)] // SQL injection attempt
    public void ZeroPhiRoomRegex_AdversarialInputs_ProperlyEnforcesConstraints(string input, bool expectedValid)
    {
        var isValid = ZeroPhiRoomRegex.IsMatch(input);
        isValid.Should().Be(expectedValid, $"Input '{input}' validity expectation mismatch.");
    }

    [Theory]
    [InlineData("staff:0123456789abcdef0123456789abcdef", true)]
    [InlineData("patient:12345-abc-DEF_789", true)]
    [InlineData("guest:temp_guest-user01", true)]
    [InlineData("participant:part-0123456789", true)]
    [InlineData("staff-0123456789abcdef0123456789abcdef", true)] // Hyphen delimiter
    [InlineData("doctor:12345678", false)] // Invalid prefix 'doctor'
    [InlineData("nurse:12345678", false)] // Invalid prefix 'nurse'
    [InlineData("admin:12345678", false)] // Invalid prefix 'admin'
    [InlineData("user:12345678", false)] // Invalid prefix 'user'
    [InlineData("patient:juan.delacruz@hospital.com", false)] // Email / PHI leak ('@' and '.')
    [InlineData("patient:Juan Dela Cruz", false)] // Space in identity
    [InlineData("patient:Jose-Rizal-🇵🇭", false)] // Flag emoji
    [InlineData("staff:", false)] // Empty payload
    [InlineData("patient-", false)] // Empty payload with hyphen
    [InlineData("guest#12345", false)] // Invalid delimiter '#'
    [InlineData("patient:<script>alert(1)</script>", false)] // XSS attempt
    [InlineData("staff:;DROP TABLE staff;--", false)] // SQL injection attempt
    public void ZeroPhiParticipantRegex_AdversarialInputs_ProperlyEnforcesConstraints(string input, bool expectedValid)
    {
        var isValid = ZeroPhiParticipantRegex.IsMatch(input);
        isValid.Should().Be(expectedValid, $"Input '{input}' validity expectation mismatch.");
    }

    [Fact]
    public void ZeroPhiParticipantRegex_BoundaryLengthTests()
    {
        var exact64Payload = new string('x', 64);
        var exact65Payload = new string('x', 65);

        ZeroPhiParticipantRegex.IsMatch($"patient:{exact64Payload}").Should().BeTrue("64 characters is the defined maximum length.");
        ZeroPhiParticipantRegex.IsMatch($"patient:{exact65Payload}").Should().BeFalse("65 characters exceeds the 64-character limit.");
    }

    [Fact]
    public async Task JoinCall_GuaranteesZeroPhiInNetworkPayloadAndAuditLog()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var requestClient = Substitute.For<IInteropRequestClient>();
        var publisher = Substitute.For<IInteropPublisher>();

        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var sensitivePatientName = "Don Juan Miguel Dela Cruz III";

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = sensitivePatientName,
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            AdmittedAtUtc = DateTime.UtcNow.AddMinutes(-5)
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var mediaResponse = new MediaRoomRespondedPayload(
            CallId: callId,
            RoomName: $"call-{callId:N}",
            RelayUrl: "wss://livekit.clinicez.internal",
            ParticipantTokens: new Dictionary<string, string>
            {
                [$"staff:{_staffId:N}"] = "token-staff",
                [$"patient:{patientId:N}"] = "token-patient"
            },
            Success: true,
            ErrorMessage: null);

        requestClient.RequestAsync<MediaRoomRequestedPayload, MediaRoomRespondedPayload>(
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(),
            Arg.Any<MediaRoomRequestedPayload>(), Arg.Any<TimeSpan?>(), Arg.Any<CancellationToken>())
            .Returns(mediaResponse);

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var result = await handler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);

        // Assert Room & Identities strictly match Zero-PHI regex
        ZeroPhiRoomRegex.IsMatch(result.RoomName).Should().BeTrue();
        ZeroPhiParticipantRegex.IsMatch(result.ParticipantIdentity).Should().BeTrue();

        // Assert no PHI leaked in MediaRoomRequested payload
        await requestClient.Received(1).RequestAsync<MediaRoomRequestedPayload, MediaRoomRespondedPayload>(
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(),
            Arg.Is<MediaRoomRequestedPayload>(p =>
                !p.RoomName.Contains("Juan") &&
                p.ParticipantIdentities.All(id => !id.Contains("Juan") && !id.Contains("Dela") && !id.Contains("Cruz")) &&
                ZeroPhiRoomRegex.IsMatch(p.RoomName) &&
                p.ParticipantIdentities.All(id => ZeroPhiParticipantRegex.IsMatch(id))),
            Arg.Any<TimeSpan?>(), Arg.Any<CancellationToken>());

        // Assert audit entry masks patient name and contains zero plaintext PHI in metadata
        var audits = await auditRepo.Query().ToListAsync();
        audits.Should().ContainSingle();
        var audit = audits[0];
        audit.PatientNameMasked.Should().Be("D*** J*** M*** D*** C*** I***");
        audit.MetadataJson.Should().NotContain("Juan");
        audit.MetadataJson.Should().NotContain("Cruz");
    }

    // =========================================================================
    // FOCUS 2: 10-SECOND INTEROP TIMEOUT & OFFLINE SIGNALING FALLBACK
    // =========================================================================

    [Fact]
    public async Task JoinCall_WhenInteropClientThrowsTimeout_ReturnsHttp200WithGracefulOfflineTokens()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var requestClient = Substitute.For<IInteropRequestClient>();
        var publisher = Substitute.For<IInteropPublisher>();

        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Jose Rizal",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            AdmittedAtUtc = DateTime.UtcNow.AddMinutes(-1)
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        // Simulate 10s timeout from interop broker
        requestClient.RequestAsync<MediaRoomRequestedPayload, MediaRoomRespondedPayload>(
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(),
            Arg.Any<MediaRoomRequestedPayload>(), Arg.Any<TimeSpan?>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromException<MediaRoomRespondedPayload>(
                new InteropRequestTimeoutException(InteropTypes.MediaRoomRequested, callId, TimeSpan.FromSeconds(10))));

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var result = await handler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);

        result.Should().NotBeNull();
        result.MediaAvailable.Should().BeFalse();
        result.IsFallbackToken.Should().BeTrue();
        result.MediaStatusMessage.Should().Be("Media broker unavailable. Call state maintained in offline signaling mode.");
        result.ClinicianToken.Should().StartWith("fallback-token-");
        result.AccessToken.Should().StartWith("fallback-token-");
        result.Token.Should().StartWith("fallback-token-");
        result.LiveKitServerUrl.Should().Be("wss://media.clinicez.internal");
        result.ExpiresAtUtc.Should().BeAfter(DateTime.UtcNow.AddMinutes(50));

        // Critical: Comms event must still be dispatched with fallback token to prevent UI hang
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallStateChanged,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            callId,
            Arg.Is<CommsCallStateChangedPayload>(p =>
                p.CallId == callId &&
                p.Status == "Admitted" &&
                p.JoinToken != null &&
                p.JoinToken.StartsWith("fallback-token-")));
    }

    [Theory]
    [InlineData(typeof(HttpRequestException))]
    [InlineData(typeof(TaskCanceledException))]
    [InlineData(typeof(IOException))]
    [InlineData(typeof(InvalidOperationException))]
    public async Task JoinCall_WhenGenericNetworkExceptionOccurs_NeverThrowsAndRecoversGracefully(Type exceptionType)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var requestClient = Substitute.For<IInteropRequestClient>();
        var publisher = Substitute.For<IInteropPublisher>();

        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Apolinario Mabini",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            AdmittedAtUtc = DateTime.UtcNow.AddMinutes(-3)
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var thrownException = (Exception)Activator.CreateInstance(exceptionType, "Simulated network transport breakdown")!;
        requestClient.RequestAsync<MediaRoomRequestedPayload, MediaRoomRespondedPayload>(
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(),
            Arg.Any<MediaRoomRequestedPayload>(), Arg.Any<TimeSpan?>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromException<MediaRoomRespondedPayload>(thrownException));

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var result = await handler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);

        result.Should().NotBeNull();
        result.MediaAvailable.Should().BeFalse();
        result.IsFallbackToken.Should().BeTrue();
        result.ClinicianToken.Should().StartWith("fallback-token-");
    }

    [Fact]
    public async Task JoinCall_WhenMediaBrokerReturnsFailureResponse_PreservesErrorMessageAndUsesFallback()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var requestClient = Substitute.For<IInteropRequestClient>();
        var publisher = Substitute.For<IInteropPublisher>();

        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Melchora Aquino",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            AdmittedAtUtc = DateTime.UtcNow.AddMinutes(-2)
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var brokerError = "LiveKit SFU room allocation capacity exceeded (HTTP 503)";
        var failureResponse = new MediaRoomRespondedPayload(
            CallId: callId,
            RoomName: $"call-{callId:N}",
            RelayUrl: string.Empty,
            ParticipantTokens: new Dictionary<string, string>(),
            Success: false,
            ErrorMessage: brokerError);

        requestClient.RequestAsync<MediaRoomRequestedPayload, MediaRoomRespondedPayload>(
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(),
            Arg.Any<MediaRoomRequestedPayload>(), Arg.Any<TimeSpan?>(), Arg.Any<CancellationToken>())
            .Returns(failureResponse);

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var result = await handler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);

        result.MediaAvailable.Should().BeFalse();
        result.IsFallbackToken.Should().BeTrue();
        result.MediaStatusMessage.Should().Be(brokerError);
        result.ClinicianToken.Should().StartWith("fallback-token-");
    }

    [Fact]
    public async Task JoinCall_WhenStaffIdMissingInContext_ThrowsUnauthorizedException()
    {
        var ctx = Substitute.For<IClinicContext>();
        ctx.ClinicId.Returns(_clinicId);
        ctx.TenantId.Returns(_tenantId);
        ctx.StaffId.Returns((Guid?)null); // Missing staff identity!
        ctx.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(ctx);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var requestClient = Substitute.For<IInteropRequestClient>();
        var publisher = Substitute.For<IInteropPublisher>();

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = Guid.NewGuid(),
            AdmittedAtUtc = DateTime.UtcNow
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, ctx, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var act = () => handler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);

        await act.Should().ThrowAsync<UnauthorizedException>()
            .WithMessage("*Authenticated staff identity required*");
    }

    // =========================================================================
    // FOCUS 3: PREPAYMENT & ADMISSION GATE BOUNDARY MATRIX
    // =========================================================================

    [Theory]
    [InlineData(TeleconsultPaymentPolicy.Prepaid, TeleconsultPaymentStatus.Pending, typeof(TeleconsultPaymentRequiredException))]
    [InlineData(TeleconsultPaymentPolicy.Prepaid, (TeleconsultPaymentStatus)99, typeof(TeleconsultPaymentRequiredException))]
    [InlineData(TeleconsultPaymentPolicy.Prepaid, TeleconsultPaymentStatus.Paid, typeof(InvalidOperationException))]
    [InlineData(TeleconsultPaymentPolicy.Prepaid, TeleconsultPaymentStatus.Exempt, typeof(InvalidOperationException))]
    [InlineData(TeleconsultPaymentPolicy.Prepaid, TeleconsultPaymentStatus.Overridden, typeof(InvalidOperationException))]
    [InlineData(TeleconsultPaymentPolicy.Postpaid, TeleconsultPaymentStatus.Pending, typeof(InvalidOperationException))]
    [InlineData(TeleconsultPaymentPolicy.Exempt, TeleconsultPaymentStatus.Exempt, typeof(InvalidOperationException))]
    public async Task JoinCall_UnadmittedPatient_AdmissionGateEnforcesStrictPaymentPolicyMatrix(
        TeleconsultPaymentPolicy policy,
        TeleconsultPaymentStatus status,
        Type expectedExceptionType)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var requestClient = Substitute.For<IInteropRequestClient>();
        var publisher = Substitute.For<IInteropPublisher>();

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Matrix Test Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = Guid.NewGuid(),
            PaymentPolicy = policy,
            PaymentStatus = status,
            PaidAmount = 550.00m,
            AdmittedAtUtc = null // UNADMITTED
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var act = () => handler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);

        var exceptionAssertion = await act.Should().ThrowAsync<Exception>();
        exceptionAssertion.Which.GetType().Should().Be(expectedExceptionType);

        if (expectedExceptionType == typeof(TeleconsultPaymentRequiredException))
        {
            var pex = (TeleconsultPaymentRequiredException)exceptionAssertion.Which;
            pex.AppointmentId.Should().Be(apt.Id);
            pex.AmountDue.Should().Be(550.00m);
        }
        else if (expectedExceptionType == typeof(InvalidOperationException))
        {
            exceptionAssertion.Which.Message.Should().Contain("Patient has not been admitted to the teleconsultation session yet.");
        }
    }

    [Fact]
    public async Task JoinCall_WhenPrepaidFeeIsNull_DefaultsFeeTo400InException()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var requestClient = Substitute.For<IInteropRequestClient>();
        var publisher = Substitute.For<IInteropPublisher>();

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Default Fee Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = Guid.NewGuid(),
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            PaidAmount = null, // No fee specified
            AdmittedAtUtc = null
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var act = () => handler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);

        var ex = await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
        ex.Which.AmountDue.Should().Be(400.00m, "Standard default teleconsult fee must be 400.00 PHP.");
    }

    // =========================================================================
    // FOCUS 4: CALL TERMINATION & RECORDING FINALIZATION STRESS HARNESS
    // =========================================================================

    [Fact]
    public async Task EndCall_WithActiveRecording_DispatchesFinalizeCommandAndCompletes()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var sender = Substitute.For<ISender>();

        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Graciano Lopez Jaena",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            Status = AppointmentStatus.Confirmed
        };
        await aptRepo.AddAsync(apt);

        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = callId,
            AppointmentId = apt.Id,
            PatientName = "Graciano Lopez Jaena",
            DoctorName = "Dr. Challenger M3",
            RecordingState = "Recording", // ACTIVE RECORDING
            StoragePolicy = "WorkspaceVaultOnly"
        };
        await sessionRepo.AddAsync(session);
        await uow.SaveChangesAsync();

        var handler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        var result = await handler.Handle(new EndTeleconsultCallCommand(apt.Id, "Consultation finished normally"), CancellationToken.None);

        result.Should().NotBeNull();
        result.Status.Should().Be("Ended");
        result.RecordingFinalized.Should().BeTrue();
        result.WormAuditLogged.Should().BeTrue();
        result.CommsCallStateChangedEnqueued.Should().BeTrue();

        // Verify MediatR sent FinalizeRecordingSessionCommand
        await sender.Received(1).Send(
            Arg.Is<FinalizeRecordingSessionCommand>(c => c.SessionId == session.Id),
            Arg.Any<CancellationToken>());

        // Verify Appointment updated to Completed
        var updatedApt = await aptRepo.Query().FirstAsync(a => a.Id == apt.Id);
        updatedApt.Status.Should().Be(AppointmentStatus.Completed);

        // Verify Comms call state changed emitted
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallStateChanged,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            callId,
            Arg.Is<CommsCallStateChangedPayload>(p =>
                p.CallId == callId &&
                p.Status == "Ended" &&
                p.StateVersion == 2));
    }

    [Fact]
    public async Task EndCall_WhenFinalizeRecordingSessionThrowsException_ResilientlyCompletesCall()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var sender = Substitute.For<ISender>();

        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Antonio Luna",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            Status = AppointmentStatus.Confirmed
        };
        await aptRepo.AddAsync(apt);

        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = callId,
            AppointmentId = apt.Id,
            PatientName = "Antonio Luna",
            DoctorName = "Dr. Challenger M3",
            RecordingState = "Recording",
            StoragePolicy = "WorkspaceVaultOnly"
        };
        await sessionRepo.AddAsync(session);
        await uow.SaveChangesAsync();

        // Simulate finalizer crashing (e.g. S3 storage upload timeout)
        sender.Send(Arg.Any<FinalizeRecordingSessionCommand>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromException<RecordingSessionDto>(new InvalidOperationException("Encrypted vault chunk upload failed.")));

        var handler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        var result = await handler.Handle(new EndTeleconsultCallCommand(apt.Id, "Call dropped"), CancellationToken.None);

        // Call MUST still complete cleanly, even if recording finalization failed
        result.Status.Should().Be("Ended");
        result.RecordingFinalized.Should().BeFalse("Recording finalization failed but did not block call termination.");

        var updatedApt = await aptRepo.Query().FirstAsync(a => a.Id == apt.Id);
        updatedApt.Status.Should().Be(AppointmentStatus.Completed);

        // Comms state still published as Ended
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallStateChanged,
            Arg.Any<Party>(), Arg.Any<Party>(), callId,
            Arg.Is<CommsCallStateChangedPayload>(p => p.Status == "Ended"));
    }

    [Theory]
    [InlineData("ReadyToRecord")]
    [InlineData("Blocked")]
    [InlineData("Finalized")]
    [InlineData("Completed")]
    [InlineData("PendingConsent")]
    public async Task EndCall_WhenSessionNotActivelyRecording_DoesNotSendFinalizeCommand(string recordingState)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var sender = Substitute.For<ISender>();

        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Sumulong",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            Status = AppointmentStatus.Confirmed
        };
        await aptRepo.AddAsync(apt);

        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = callId,
            AppointmentId = apt.Id,
            PatientName = "Juan Sumulong",
            DoctorName = "Dr. Challenger M3",
            RecordingState = recordingState,
            StoragePolicy = "WorkspaceVaultOnly"
        };
        await sessionRepo.AddAsync(session);
        await uow.SaveChangesAsync();

        var handler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        var result = await handler.Handle(new EndTeleconsultCallCommand(apt.Id), CancellationToken.None);

        result.RecordingFinalized.Should().BeFalse();
        await sender.DidNotReceive().Send(Arg.Any<FinalizeRecordingSessionCommand>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task EndCall_OnAlreadyCompletedAppointment_IsIdempotentAndSafe()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var sender = Substitute.For<ISender>();

        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Idempotent Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            Status = AppointmentStatus.Completed // ALREADY COMPLETED
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var handler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        var result = await handler.Handle(new EndTeleconsultCallCommand(apt.Id), CancellationToken.None);

        result.Status.Should().Be("Ended");
        var updated = await aptRepo.Query().FirstAsync(a => a.Id == apt.Id);
        updated.Status.Should().Be(AppointmentStatus.Completed);
    }

    [Fact]
    public async Task EndCall_WhenAppointmentIsNotTeleconsult_ThrowsBadRequestException()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var sender = Substitute.For<ISender>();

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Physical In-Person Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.InPerson,
            CallId = null
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var handler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        var act = () => handler.Handle(new EndTeleconsultCallCommand(apt.Id), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*not a teleconsultation*");
    }

    [Fact]
    public async Task EndCall_WhenTeleconsultHasNoCallId_ThrowsInvalidOperationException()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var sender = Substitute.For<ISender>();

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Teleconsult Missing CallId",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = null
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var handler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        var act = () => handler.Handle(new EndTeleconsultCallCommand(apt.Id), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Appointment has no CallId*");
    }

    // =========================================================================
    // FOCUS 5: CONSULTATION LINKAGE COLLISION DEFENSE
    // =========================================================================

    [Fact]
    public async Task CreateConsultation_WhenSessionUnlinked_SuccessfullyLinksConsultationId()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);

        var aptId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            AppointmentId = aptId,
            ConsultationId = null, // UNLINKED
            PatientId = Guid.NewGuid(),
            PatientName = "Unlinked Session Patient",
            DoctorId = _staffId,
            DoctorName = "Dr. Challenger M3",
            RecordingState = "Completed",
            StoragePolicy = "WorkspaceVaultOnly"
        };
        await sessionRepo.AddAsync(session);
        await uow.SaveChangesAsync();

        var handler = new CreateConsultationCommandHandler(
            consultRepo, queueRepo, uow, _clinicContext,
            recordingSessionRepository: sessionRepo);

        var command = new CreateConsultationCommand(
            PatientId: session.PatientId,
            PatientName: session.PatientName,
            DoctorId: _staffId,
            DoctorName: "Dr. Challenger M3",
            AppointmentId: aptId);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.AppointmentId.Should().Be(aptId);

        // Verify session was linked to the new encounter
        var updatedSession = await sessionRepo.Query().FirstAsync(s => s.Id == session.Id);
        updatedSession.ConsultationId.Should().Be(result.Id);
    }

    [Fact]
    public async Task CreateConsultation_WhenCollisionOccurs_ThrowsInvalidOperationExceptionAndProtectsLinkage()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);

        var aptId = Guid.NewGuid();
        var existingConsultationEncounterId = Guid.NewGuid();

        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            AppointmentId = aptId,
            ConsultationId = existingConsultationEncounterId, // ALREADY LINKED TO ENCOUNTER 1
            PatientId = Guid.NewGuid(),
            PatientName = "Colliding Encounter Patient",
            DoctorId = _staffId,
            DoctorName = "Dr. Rizal",
            RecordingState = "Completed",
            StoragePolicy = "WorkspaceVaultOnly"
        };
        await sessionRepo.AddAsync(session);
        await uow.SaveChangesAsync();

        var handler = new CreateConsultationCommandHandler(
            consultRepo, queueRepo, uow, _clinicContext,
            recordingSessionRepository: sessionRepo);

        // Attempt to create Consultation Encounter 2 linking to the same appointment
        var command = new CreateConsultationCommand(
            PatientId: session.PatientId,
            PatientName: session.PatientName,
            DoctorId: _staffId,
            DoctorName: "Dr. Challenger M3",
            AppointmentId: aptId);

        var act = () => handler.Handle(command, CancellationToken.None);

        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage($"*Recording session {session.Id} for appointment {aptId} is already linked to consultation {existingConsultationEncounterId}*");

        // Assert session ConsultationId was NOT overwritten
        var untouchedSession = await sessionRepo.Query().FirstAsync(s => s.Id == session.Id);
        untouchedSession.ConsultationId.Should().Be(existingConsultationEncounterId);
    }

    [Fact]
    public async Task CreateConsultation_WhenMultipleSessionsExist_LinksAllUnlinkedSessions()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);

        var aptId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // Simulate dropped and reconnected call producing 2 sessions for the same appointment
        var session1 = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            AppointmentId = aptId,
            ConsultationId = null,
            PatientId = patientId,
            PatientName = "Multi Session Patient",
            DoctorId = _staffId,
            DoctorName = "Dr. Challenger M3",
            RecordingState = "Completed",
            StoragePolicy = "WorkspaceVaultOnly"
        };
        var session2 = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            AppointmentId = aptId,
            ConsultationId = null,
            PatientId = patientId,
            PatientName = "Multi Session Patient",
            DoctorId = _staffId,
            DoctorName = "Dr. Challenger M3",
            RecordingState = "Completed",
            StoragePolicy = "WorkspaceVaultOnly"
        };
        await sessionRepo.AddAsync(session1);
        await sessionRepo.AddAsync(session2);
        await uow.SaveChangesAsync();

        var handler = new CreateConsultationCommandHandler(
            consultRepo, queueRepo, uow, _clinicContext,
            recordingSessionRepository: sessionRepo);

        var command = new CreateConsultationCommand(
            PatientId: patientId,
            PatientName: "Multi Session Patient",
            DoctorId: _staffId,
            DoctorName: "Dr. Challenger M3",
            AppointmentId: aptId);

        var result = await handler.Handle(command, CancellationToken.None);

        // Both sessions must now be linked to the newly created consultation
        var updatedSession1 = await sessionRepo.Query().FirstAsync(s => s.Id == session1.Id);
        var updatedSession2 = await sessionRepo.Query().FirstAsync(s => s.Id == session2.Id);

        updatedSession1.ConsultationId.Should().Be(result.Id);
        updatedSession2.ConsultationId.Should().Be(result.Id);
    }

    [Fact]
    public async Task CreateConsultation_WhenRepoNotPassedInConstructor_ResolvesViaUnitOfWorkProvider()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);

        var aptId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            AppointmentId = aptId,
            ConsultationId = null,
            PatientId = Guid.NewGuid(),
            PatientName = "UoW Fallback Patient",
            DoctorId = _staffId,
            DoctorName = "Dr. Challenger M3",
            RecordingState = "Completed",
            StoragePolicy = "WorkspaceVaultOnly"
        };
        await sessionRepo.AddAsync(session);
        await uow.SaveChangesAsync();

        // Pass null recordingSessionRepository to verify fallback to UnitOfWork
        var handler = new CreateConsultationCommandHandler(
            consultRepo, queueRepo, uow, _clinicContext,
            recordingSessionRepository: null);

        var command = new CreateConsultationCommand(
            PatientId: session.PatientId,
            PatientName: session.PatientName,
            DoctorId: _staffId,
            DoctorName: "Dr. Challenger M3",
            AppointmentId: aptId);

        var result = await handler.Handle(command, CancellationToken.None);

        var updated = await sessionRepo.Query().FirstAsync(s => s.Id == session.Id);
        updated.ConsultationId.Should().Be(result.Id);
    }

    // =========================================================================
    // FOCUS 6: PLAYBACK HMAC SECURITY & RETENTION SIDECAR HYGIENE
    // =========================================================================

    [Fact]
    public async Task StreamRecording_WhenTicketSignatureIsTampered_ReturnsUnauthorized()
    {
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();
        var storage = Substitute.For<IClinicStorageService>();
        var encryptionService = Substitute.For<IClinicEncryptionService>();
        var config = Substitute.For<IConfiguration>();

        var signingKey = "playback-signing-secret-cmk-2026-very-secure-key";
        config["RecordingPlayback:SigningKey"].Returns(signingKey);

        var sessionId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Tamper Test Patient",
            DoctorName = "Dr. Rizal",
            ManifestStorageKey = "vault/tamper/manifest.cez",
            IsPurged = false
        };
        db.TeleconsultRecordingSessions.Add(session);
        await db.SaveChangesAsync();

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, encryptionService, config, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var futureTicks = DateTime.UtcNow.AddMinutes(15).Ticks;
        var payload = $"{sessionId}:{_staffId}:{futureTicks}:nonce123";
        var tamperedSignature = "tampered-bad-signature";
        var badTicket = $"{payload}.{tamperedSignature}";

        var result = await controller.StreamRecording(sessionId, badTicket, null, CancellationToken.None);

        var unauthorized = result.Should().BeOfType<UnauthorizedObjectResult>().Subject;
        unauthorized.Value.Should().Be("Playback ticket signature verification failed.");
    }

    [Fact]
    public async Task StreamRecording_WhenTicketIsExpired_ReturnsUnauthorized()
    {
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();
        var storage = Substitute.For<IClinicStorageService>();
        var encryptionService = Substitute.For<IClinicEncryptionService>();
        var config = Substitute.For<IConfiguration>();

        var signingKey = "playback-signing-secret-cmk-2026-very-secure-key";
        config["RecordingPlayback:SigningKey"].Returns(signingKey);

        var sessionId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Expired Ticket Patient",
            DoctorName = "Dr. Rizal",
            ManifestStorageKey = "vault/expired/manifest.cez",
            IsPurged = false
        };
        db.TeleconsultRecordingSessions.Add(session);
        await db.SaveChangesAsync();

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, encryptionService, config, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Expired 5 minutes ago
        var expiredTicks = DateTime.UtcNow.AddMinutes(-5).Ticks;
        var payload = $"{sessionId}:{_staffId}:{expiredTicks}:nonce123";

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(signingKey));
        var sig = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
        var expiredTicket = $"{payload}.{sig}";

        var result = await controller.StreamRecording(sessionId, expiredTicket, null, CancellationToken.None);

        var unauthorized = result.Should().BeOfType<UnauthorizedObjectResult>().Subject;
        unauthorized.Value.Should().Be("Playback ticket has expired.");
    }

    [Fact]
    public async Task RetentionSweeper_WhenSidecarDeletionFails_DoesNotHaltSweeperExecution()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var storage = Substitute.For<IClinicStorageService>();

        var expiredDate = DateTime.UtcNow.AddDays(-20);
        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Sweeper Resilience Patient",
            DoctorName = "Dr. Challenger M3",
            ExpiresAtUtc = expiredDate,
            IsLegalHold = false,
            IsPurged = false,
            ManifestStorageKey = "vault/resilient/manifest.cez",
            Segments = new List<TeleconsultRecordingSegment>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    ClinicId = _clinicId,
                    TenantId = _tenantId,
                    SegmentIndex = 0,
                    StorageKey = "vault/resilient/seg_00000.cez",
                    Sha256Checksum = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                    IvBase64 = "dGVzdC1pdi0xMg==",
                    TagBase64 = "dGVzdC10YWctMTY="
                }
            }
        };
        context.TeleconsultRecordingSessions.Add(session);
        await context.SaveChangesAsync();

        storage.FileExistsAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(true);
        // Simulate sidecar deletion throwing an error (e.g. permission or transient S3 error)
        storage.DeleteEncryptedFileAsync(Arg.Is<string>(s => s.EndsWith(".key")), Arg.Any<CancellationToken>())
            .Returns(Task.FromException(new IOException("S3 sidecar transient IO error")));

        var services = new ServiceCollection();
        services.AddSingleton(context);
        services.AddSingleton(storage);
        var sp = services.BuildServiceProvider();

        var sweeper = new RecordingRetentionSweeper(sp, NullLogger<RecordingRetentionSweeper>.Instance);

        // Sweeper must NOT throw, and still successfully mark session purged
        var count = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);

        count.Should().Be(1);
        session.IsPurged.Should().BeTrue();
    }
}
