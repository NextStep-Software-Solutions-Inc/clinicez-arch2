using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Clinic.Infrastructure.Services.Storage;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
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

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical White-Box Adversarial Stress Testing Suite for Challenger 1 (Milestone 6 Phase 2).
/// Hardens test coverage across the 5 primary backend and contract attack surfaces:
/// 1. Unpaid Admission Attempts & Emergency Override Attack Surface (RBAC, note length, WORM audit, CommsCallPaymentCleared).
/// 2. Zero-PHI Token Validation Attack Surface (regex validation on room names and participant identities, boundary length tests).
/// 3. CMK AES-256-GCM Vault Encryption Attack Surface (corrupted ciphertext, missing sidecar key, HMAC signature tampering, 15-min tickets).
/// 4. Retention Sweeper Attack Surface (medico-legal hold immunity defense, clean deletion of segment chunks and .key sidecars).
/// 5. Concurrency & Race Conditions Attack Surface (multi-threaded admission, concurrent distinct calls, idempotent payment clearance).
/// </summary>
public sealed class ChallengerM6_1TeleconsultAdversarialStressTests
{
    private const string MasterSecret = "sovereign-vault-cmk-master-secret-at-least-32-bytes-long!";
    private const string PlaybackSigningKey = "playback-signing-secret-cmk-2026-very-secure-key";

    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-challenger-m61";
    private readonly Guid _doctorStaffId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;
    private readonly IConfiguration _configuration;
    private readonly ClinicEncryptionService _encryptionService;

    private static readonly Regex ZeroPhiRoomRegex = new(@"^call-[0-9a-fA-F\-]{32,36}$", RegexOptions.Compiled);
    private static readonly Regex ZeroPhiParticipantRegex = new(@"^(staff|patient|guest|participant)(:|-)[0-9a-zA-Z\-_]{1,64}$", RegexOptions.Compiled);

    public ChallengerM6_1TeleconsultAdversarialStressTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_doctorStaffId);
        _clinicContext.StaffName.Returns("Dr. Challenger M6-1");
        _clinicContext.StaffRole.Returns("Doctor");
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsRead).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.TeleconsultRecord).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.SettingsManage).Returns(true);

        var configValues = new Dictionary<string, string?>
        {
            [ClinicEncryptionKeyRing.MasterSecretKey] = MasterSecret,
            ["RecordingPlayback:SigningKey"] = PlaybackSigningKey
        };
        _configuration = new ConfigurationBuilder().AddInMemoryCollection(configValues).Build();

        var keyRing = ClinicEncryptionKeyRing.FromConfiguration(_configuration);
        _encryptionService = new ClinicEncryptionService(keyRing);
    }

    #region Storage Test Double

    private sealed class InMemoryClinicStorage : IClinicStorageService
    {
        public readonly ConcurrentDictionary<string, byte[]> Files = new();
        public readonly ConcurrentBag<string> DeletedKeys = new();

        public Task<string> SaveEncryptedFileAsync(string storageKey, byte[] ciphertext, CancellationToken cancellationToken = default)
        {
            Files[storageKey] = ciphertext;
            return Task.FromResult(storageKey);
        }

        public async Task<string> SaveEncryptedStreamAsync(string storageKey, Stream ciphertextStream, CancellationToken cancellationToken = default)
        {
            using var ms = new MemoryStream();
            await ciphertextStream.CopyToAsync(ms, cancellationToken);
            Files[storageKey] = ms.ToArray();
            return storageKey;
        }

        public Task<byte[]> ReadEncryptedFileAsync(string storageKey, CancellationToken cancellationToken = default)
        {
            if (!Files.TryGetValue(storageKey, out var bytes))
            {
                throw new FileNotFoundException($"File not found in memory storage: {storageKey}");
            }
            return Task.FromResult(bytes);
        }

        public Task<Stream> OpenReadEncryptedStreamAsync(string storageKey, CancellationToken cancellationToken = default)
        {
            if (!Files.TryGetValue(storageKey, out var bytes))
            {
                throw new FileNotFoundException($"File not found in memory storage: {storageKey}");
            }
            return Task.FromResult<Stream>(new MemoryStream(bytes));
        }

        public Task DeleteEncryptedFileAsync(string storageKey, CancellationToken cancellationToken = default)
        {
            DeletedKeys.Add(storageKey);
            Files.TryRemove(storageKey, out _);
            return Task.CompletedTask;
        }

        public Task<bool> FileExistsAsync(string storageKey, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(Files.ContainsKey(storageKey));
        }
    }

    private static string GenerateHmacTicket(Guid sessionId, Guid clinicId, Guid staffId, DateTime expiresAtUtc, string signingKey)
    {
        var payload = $"{sessionId:N}:{clinicId:N}:{expiresAtUtc.Ticks}:{staffId}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(signingKey));
        var signature = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
        return $"{payload}.{signature}";
    }

    #endregion

    #region 1. Unpaid Admission Attempts & Emergency Override Attack Surface

    [Fact]
    public async Task UnpaidAdmission_PrepaidWithoutOverride_ThrowsTeleconsultPaymentRequiredException_409()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Penduko",
            DoctorId = _doctorStaffId,
            DoctorName = "Dr. Challenger M6-1",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            PaidAmount = null
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointment.Id, null), CancellationToken.None);

        var ex = await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
        ex.Which.AppointmentId.Should().Be(appointment.Id);
        TeleconsultPaymentRequiredException.ErrorCode.Should().Be("payment_required");
    }

    [Theory]
    [InlineData(false, false)] // No consultation permission at all
    public async Task UnpaidAdmission_OverrideWithUnauthorizedStaff_ThrowsForbiddenException_403(bool hasSign, bool hasWrite)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var unauthorizedContext = Substitute.For<IClinicContext>();
        unauthorizedContext.ClinicId.Returns(_clinicId);
        unauthorizedContext.TenantId.Returns(_tenantId);
        unauthorizedContext.StaffId.Returns(Guid.NewGuid());
        unauthorizedContext.StaffName.Returns("Receptionist Maria");
        unauthorizedContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(hasSign);
        unauthorizedContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(hasWrite);

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Penduko",
            DoctorId = _doctorStaffId,
            DoctorName = "Dr. Challenger M6-1",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, unauthorizedContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(
            appointment.Id,
            new EmergencyOverrideDto("ACUTE-CHEST-PAIN", "Severe chest pain requiring urgent triage")), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*Only attending clinicians or staff with consultation authority*");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("ok")]
    [InlineData("stat")]
    [InlineData("1234")]
    [InlineData(" \t\r\n ")]
    public async Task UnpaidAdmission_OverrideWithSubFiveCharacterNote_ThrowsBadRequestException(string? invalidNote)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Penduko",
            DoctorId = _doctorStaffId,
            DoctorName = "Dr. Challenger M6-1",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(
            appointment.Id,
            new EmergencyOverrideDto("ACUTE-CHEST-PAIN", invalidNote)), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*minimum 5 characters*");
    }

    [Theory]
    [InlineData(null, "STAFF-OVERRIDE")]
    [InlineData("", "STAFF-OVERRIDE")]
    [InlineData("   ", "STAFF-OVERRIDE")]
    [InlineData("UNRECOGNIZED_CODE_XYZ", "STAFF-OVERRIDE")]
    [InlineData(EmergencyOverrideReasonCodes.AcuteChestPain, EmergencyOverrideReasonCodes.AcuteChestPain)] // "EMERG-01"
    [InlineData(EmergencyOverrideReasonCodes.SevereRespiratoryDistress, EmergencyOverrideReasonCodes.SevereRespiratoryDistress)] // "EMERG-02"
    [InlineData("STAFF-OVERRIDE", "STAFF-OVERRIDE")]
    public async Task UnpaidAdmission_OverrideWithValidNote_DefaultsMissingOrInvalidReasonCode(string? inputCode, string expectedResolvedCode)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Penduko",
            DoctorId = _doctorStaffId,
            DoctorName = "Dr. Challenger M6-1",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var result = await handler.Handle(new AdmitTeleconsultPatientCommand(
            appointment.Id,
            new EmergencyOverrideDto(inputCode, "Valid clinical justification note for emergency admission.")), CancellationToken.None);

        result.Should().NotBeNull();
        result.IsEmergencyOverride.Should().BeTrue();
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);

        var refreshed = await context.Appointments.FindAsync(appointment.Id);
        refreshed!.EmergencyOverrideReasonCode.Should().Be(expectedResolvedCode);
        refreshed.EmergencyOverrideReasonNote.Should().Be("Valid clinical justification note for emergency admission.");
    }

    [Fact]
    public async Task UnpaidAdmission_ValidOverride_EmitsCommsCallPaymentCleared_AndCreatesWormAuditEntry()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var callId = Guid.NewGuid();

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            DoctorId = _doctorStaffId,
            DoctorName = "Dr. Challenger M6-1",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = callId
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        const string reasonCode = EmergencyOverrideReasonCodes.SevereRespiratoryDistress; // "EMERG-02"
        const string reasonNote = "Patient experiencing severe dyspnea, admitting immediately.";

        var result = await handler.Handle(new AdmitTeleconsultPatientCommand(
            appointmentId,
            new EmergencyOverrideDto(reasonCode, reasonNote)), CancellationToken.None);

        // Assert admission result
        result.AppointmentId.Should().Be(appointmentId);
        result.CallId.Should().Be(callId);
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        result.IsEmergencyOverride.Should().BeTrue();
        result.RoomName.Should().Be($"call-{callId:N}");

        // Assert Appointment updated
        var refreshedAppointment = await context.Appointments.FindAsync(appointmentId);
        refreshedAppointment!.Status.Should().Be(AppointmentStatus.InConsultation);
        refreshedAppointment.AdmittedAtUtc.Should().NotBeNull();
        refreshedAppointment.EmergencyOverrideReasonCode.Should().Be(reasonCode);
        refreshedAppointment.EmergencyOverrideReasonNote.Should().Be(reasonNote);
        refreshedAppointment.EmergencyOverrideDoctorId.Should().Be(_doctorStaffId);

        // Assert WORM Audit Entry created
        var auditEntry = await context.AuditEntries
            .FirstOrDefaultAsync(a => a.TargetEntityId == appointmentId.ToString() && a.Action == "teleconsult.admission.emergency_override");
        auditEntry.Should().NotBeNull();
        auditEntry!.Category.Should().Be(ClinicAuditCategories.Clinical);
        auditEntry.Severity.Should().Be(ClinicAuditSeverities.Emergency);
        auditEntry.Outcome.Should().Be(ClinicAuditOutcomes.Success);
        auditEntry.PatientId.Should().Be(patientId);
        auditEntry.PatientNameMasked.Should().Be("J*** D*** C***");
        auditEntry.MetadataJson.Should().Contain(reasonCode);
        auditEntry.MetadataJson.Should().Contain(reasonNote);

        // Assert CommsCallPaymentCleared emitted
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            callId,
            Arg.Is<CommsCallPaymentClearedPayload>(p =>
                p.CallId == callId &&
                p.IsEmergencyOverride == true &&
                p.PaymentMethod == "EmergencyOverride" &&
                p.OverrideReason == $"{reasonCode}: {reasonNote}")
        );
    }

    [Fact]
    public async Task Admission_NonTeleconsultAppointment_ThrowsBadRequestException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Regular InPerson Patient",
            DoctorId = _doctorStaffId,
            DoctorName = "Dr. Challenger M6-1",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.InPerson,
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointment.Id, null), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*not a teleconsultation*");
    }

    #endregion

    #region 2. Zero-PHI Token Validation Attack Surface

    [Theory]
    [InlineData("call-00000000000000000000000000000000", true)]  // 32 hex chars
    [InlineData("call-00000000-0000-0000-0000-000000000000", true)]  // 36 chars with hyphens
    [InlineData("call-abcdef0123456789abcdef0123456789", true)]
    [InlineData("call-ABCDEF0123456789ABCDEF0123456789", true)]  // Case insensitive
    [InlineData("call-john-doe-room-1234", false)]                // PHI leaked
    [InlineData("call-maria-santos-teleconsult", false)]          // PHI leaked
    [InlineData("call-12345678-1234-1234-1234-1234567890ab'; DROP TABLE Appointments;--", false)] // SQLi
    [InlineData("call-../../../../etc/passwd", false)]            // Path traversal
    [InlineData("room-00000000-0000-0000-0000-000000000000", false)] // Wrong prefix
    [InlineData("call:00000000-0000-0000-0000-000000000000", false)] // Wrong delimiter
    [InlineData("call-", false)]                                   // Missing ID
    [InlineData("call-12345678", false)]                           // Too short (8 chars)
    [InlineData("call-123456789012345678901234567890123456789", false)] // Too long (39 chars)
    [InlineData("call-12345678-1234-1234-1234-1234567890zg", false)] // Invalid hex char 'z','g'
    public void ZeroPhiRoomRegex_AdversarialInputs_StrictlyEnforcesGuardrails(string roomName, bool expectedValid)
    {
        var isValid = ZeroPhiRoomRegex.IsMatch(roomName);
        isValid.Should().Be(expectedValid, $"Room '{roomName}' validity must match {expectedValid}");
    }

    [Theory]
    [InlineData("staff:doctor-123", true)]
    [InlineData("staff:00000000000000000000000000000000", true)]
    [InlineData("patient:pt_999", true)]
    [InlineData("guest:observer-1", true)]
    [InlineData("participant:anon-session", true)]
    [InlineData("staff-doctor-123", true)] // Hyphen delimiter allowed
    [InlineData("patient-pt_999", true)]
    [InlineData("patient:juan.delacruz@hospital.ph", false)] // Email / PHI
    [InlineData("patient:+639171234567", false)]            // Phone / PHI
    [InlineData("patient:Juan Dela Cruz", false)]            // Spaces / Full Name
    [InlineData("patient:juan/delacruz", false)]             // Slash
    [InlineData("doctor:dr-123", false)]                    // Invalid role prefix ('doctor' instead of 'staff')
    [InlineData("admin:admin-01", false)]                   // Invalid role prefix
    [InlineData("nurse:nurse-10", false)]                   // Invalid role prefix
    [InlineData("patient:<script>alert(1)</script>", false)] // XSS attempt
    [InlineData("patient:", false)]                         // Empty payload
    [InlineData("patient:user$123", false)]                 // Disallowed symbol '$'
    [InlineData("staff:dr.santos", false)]                  // Disallowed symbol '.'
    public void ZeroPhiParticipantRegex_AdversarialInputs_StrictlyEnforcesGuardrails(string identity, bool expectedValid)
    {
        var isValid = ZeroPhiParticipantRegex.IsMatch(identity);
        isValid.Should().Be(expectedValid, $"Identity '{identity}' validity must match {expectedValid}");
    }

    [Fact]
    public void ZeroPhiParticipantRegex_BoundaryLengthConstraints()
    {
        // Max payload length is 64 characters
        var payload64 = new string('a', 64);
        var payload65 = new string('a', 65);

        ZeroPhiParticipantRegex.IsMatch($"patient:{payload64}").Should().BeTrue("Exact 64-char payload is permitted.");
        ZeroPhiParticipantRegex.IsMatch($"patient:{payload65}").Should().BeFalse("65-char payload exceeds 64-char limit.");
        ZeroPhiParticipantRegex.IsMatch($"staff:{payload64}").Should().BeTrue();
        ZeroPhiParticipantRegex.IsMatch($"staff:{payload65}").Should().BeFalse();
    }

    [Fact]
    public async Task JoinTeleconsultCall_WhenStaffIdentityViolatesZeroPhi_ThrowsUnauthorizedException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var requestClient = Substitute.For<IInteropRequestClient>();
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Penduko",
            DoctorId = _doctorStaffId,
            DoctorName = "Dr. Challenger M6-1",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
            PaymentStatus = TeleconsultPaymentStatus.Exempt,
            CallId = Guid.NewGuid(),
            AdmittedAtUtc = DateTime.UtcNow
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        // Simulate an invalid context where StaffId is null
        var invalidStaffContext = Substitute.For<IClinicContext>();
        invalidStaffContext.ClinicId.Returns(_clinicId);
        invalidStaffContext.TenantId.Returns(_tenantId);
        invalidStaffContext.StaffId.Returns((Guid?)null); // Null StaffId
        invalidStaffContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);

        var handler = new JoinTeleconsultCallCommandHandler(
            appointmentRepo, settingsRepo, auditRepo, uow, invalidStaffContext,
            requestClient, publisher, NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var act = () => handler.Handle(new JoinTeleconsultCallCommand(appointment.Id), CancellationToken.None);

        await act.Should().ThrowAsync<UnauthorizedException>()
            .WithMessage("*Authenticated staff identity required*");
    }

    #endregion

    #region 3. CMK AES-256-GCM Vault Encryption Attack Surface

    [Fact]
    public async Task VaultEncryption_CorruptedCiphertext_ThrowsCryptographicException()
    {
        var rawData = Encoding.UTF8.GetBytes("CRITICAL_PATIENT_TELECONSULT_RECORDING_CHUNK_10_SECONDS");

        var encrypted = await _encryptionService.EncryptAsync(rawData, _tenantId, _clinicId);
        encrypted.Ciphertext.Should().NotBeNullOrEmpty();

        // Corrupt the ciphertext by flipping bytes
        var corruptedCiphertext = (byte[])encrypted.Ciphertext.Clone();
        corruptedCiphertext[0] ^= 0xFF;
        corruptedCiphertext[corruptedCiphertext.Length / 2] ^= 0xAA;

        var act = () => _encryptionService.DecryptAsync(
            corruptedCiphertext,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            _tenantId,
            _clinicId);

        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task VaultEncryption_CorruptedAuthTag_ThrowsCryptographicException()
    {
        var rawData = Encoding.UTF8.GetBytes("CONFIDENTIAL_CONSULTATION_AUDIO_PAYLOAD");

        var encrypted = await _encryptionService.EncryptAsync(rawData, _tenantId, _clinicId);

        // Corrupt the authentication tag
        var tagBytes = Convert.FromBase64String(encrypted.TagBase64);
        tagBytes[0] ^= 0x55;
        var corruptedTagBase64 = Convert.ToBase64String(tagBytes);

        var act = () => _encryptionService.DecryptAsync(
            encrypted.Ciphertext,
            encrypted.IvBase64,
            corruptedTagBase64,
            encrypted.WrappedKeyJson,
            _tenantId,
            _clinicId);

        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task VaultEncryption_TruncatedCiphertext_ThrowsCryptographicException()
    {
        var rawData = Encoding.UTF8.GetBytes("FULL_LENGTH_VIDEO_PACKET_STREAM_DATA");

        var encrypted = await _encryptionService.EncryptAsync(rawData, _tenantId, _clinicId);

        // Truncate ciphertext by half
        var truncated = encrypted.Ciphertext.Take(encrypted.Ciphertext.Length / 2).ToArray();

        var act = () => _encryptionService.DecryptAsync(
            truncated,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            _tenantId,
            _clinicId);

        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task VaultEncryption_CrossTenantOrCrossClinicDecryptionAttempt_ThrowsCryptographicException()
    {
        var rawData = Encoding.UTF8.GetBytes("TENANT_ISOLATED_RECORDING_DATA");

        var encrypted = await _encryptionService.EncryptAsync(rawData, _tenantId, _clinicId);

        // Attempt decryption with wrong tenant
        var wrongTenantAct = () => _encryptionService.DecryptAsync(
            encrypted.Ciphertext,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            "foreign-tenant-attempting-access",
            _clinicId);

        await wrongTenantAct.Should().ThrowAsync<CryptographicException>();

        // Attempt decryption with wrong clinic
        var wrongClinicAct = () => _encryptionService.DecryptAsync(
            encrypted.Ciphertext,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            _tenantId,
            Guid.NewGuid());

        await wrongClinicAct.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task StreamRecording_MissingPlaybackTicket_Returns401Unauthorized()
    {
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _encryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var result = await controller.StreamRecording(Guid.NewGuid(), ticket: "", segmentIndex: 0, CancellationToken.None);

        var unauthorized = result.Should().BeOfType<UnauthorizedObjectResult>().Subject;
        unauthorized.Value.Should().Be("Playback ticket is required.");
    }

    [Theory]
    [InlineData("invalid_format_without_dot")]
    [InlineData("part1.part2.part3")]
    public async Task StreamRecording_MalformedPlaybackTicket_WrongPartCount_Returns400BadRequest(string malformedTicket)
    {
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _encryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var result = await controller.StreamRecording(Guid.NewGuid(), ticket: malformedTicket, segmentIndex: 0, CancellationToken.None);

        var badRequest = result.Should().BeOfType<BadRequestObjectResult>().Subject;
        badRequest.Value.Should().Be("Invalid ticket format.");
    }

    [Fact]
    public async Task StreamRecording_MalformedPlaybackTicket_WrongPayloadStructure_Returns400BadRequest()
    {
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        // Valid signature, but payload has only 2 colon parts instead of 4
        var malformedPayload = "partA:partB";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(PlaybackSigningKey));
        var signature = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(malformedPayload)))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
        var ticket = $"{malformedPayload}.{signature}";

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _encryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var result = await controller.StreamRecording(Guid.NewGuid(), ticket: ticket, segmentIndex: 0, CancellationToken.None);

        var badRequest = result.Should().BeOfType<BadRequestObjectResult>().Subject;
        badRequest.Value.Should().Be("Invalid ticket payload structure.");
    }

    [Fact]
    public async Task StreamRecording_TamperedHmacSignature_Returns401Unauthorized()
    {
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var validTicket = GenerateHmacTicket(sessionId, _clinicId, _doctorStaffId, DateTime.UtcNow.AddMinutes(15), PlaybackSigningKey);

        // Tamper with signature
        var tamperedTicket = validTicket + "_tampered";

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _encryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var result = await controller.StreamRecording(sessionId, ticket: tamperedTicket, segmentIndex: 0, CancellationToken.None);

        var unauthorized = result.Should().BeOfType<UnauthorizedObjectResult>().Subject;
        unauthorized.Value.Should().Be("Playback ticket signature verification failed.");
    }

    [Fact]
    public async Task StreamRecording_ExpiredPlaybackTicket_Returns401Unauthorized()
    {
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        // Expired 1 minute ago
        var expiredTicket = GenerateHmacTicket(sessionId, _clinicId, _doctorStaffId, DateTime.UtcNow.AddMinutes(-1), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _encryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var result = await controller.StreamRecording(sessionId, ticket: expiredTicket, segmentIndex: 0, CancellationToken.None);

        var unauthorized = result.Should().BeOfType<UnauthorizedObjectResult>().Subject;
        unauthorized.Value.Should().Be("Playback ticket has expired.");
    }

    [Fact]
    public async Task StreamRecording_MismatchedSessionIdInTicket_Returns401Unauthorized()
    {
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var targetSessionId = Guid.NewGuid();
        var otherSessionId = Guid.NewGuid();
        var ticketForOtherSession = GenerateHmacTicket(otherSessionId, _clinicId, _doctorStaffId, DateTime.UtcNow.AddMinutes(15), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _encryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var result = await controller.StreamRecording(targetSessionId, ticket: ticketForOtherSession, segmentIndex: 0, CancellationToken.None);

        var unauthorized = result.Should().BeOfType<UnauthorizedObjectResult>().Subject;
        unauthorized.Value.Should().Be("Playback ticket does not match the requested recording session.");
    }

    #endregion

    #region 4. Retention Sweeper Attack Surface

    [Fact]
    public async Task RetentionSweeper_MedicoLegalHoldDefense_ImmunizesRecordingFromPurgeAndDeletion()
    {
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);

        var sessionId = Guid.NewGuid();
        var storageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var sidecarKey = $"{storageKey}.key";
        var manifestKey = $"{_tenantId}/{_clinicId}/{sessionId}/manifest.json";
        var manifestSidecarKey = $"{manifestKey}.key";

        // Store segment and keys in storage
        await storage.SaveEncryptedFileAsync(storageKey, new byte[] { 1, 2, 3 });
        await storage.SaveEncryptedFileAsync(sidecarKey, Encoding.UTF8.GetBytes("{}"));
        await storage.SaveEncryptedFileAsync(manifestKey, Encoding.UTF8.GetBytes("{}"));
        await storage.SaveEncryptedFileAsync(manifestSidecarKey, Encoding.UTF8.GetBytes("{}"));

        // Recording has EXPIRED retention in past, but has IsLegalHold == true!
        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Legal Hold",
            DoctorId = _doctorStaffId,
            DoctorName = "Dr. Challenger M6-1",
            StoragePolicy = "WorkspaceVaultOnly",
            RecordingState = "Completed",
            ExpiresAtUtc = DateTime.UtcNow.AddDays(-10), // Expired!
            IsLegalHold = true,                          // DEFENSE ACTIVE!
            LegalHoldReason = "Medical Malpractice Investigation",
            IsPurged = false,
            ManifestStorageKey = manifestKey
        };
        session.Segments.Add(new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            SegmentIndex = 0,
            StorageKey = storageKey,
            Sha256Checksum = "mock-sha256",
            IvBase64 = "mock-iv",
            TagBase64 = "mock-tag"
        });

        db.TeleconsultRecordingSessions.Add(session);
        await db.SaveChangesAsync();

        var services = new ServiceCollection();
        services.AddSingleton(db);
        services.AddSingleton<IClinicStorageService>(storage);
        var sp = services.BuildServiceProvider();

        var sweeper = new RecordingRetentionSweeper(sp, NullLogger<RecordingRetentionSweeper>.Instance);

        // Act: Run retention sweep
        var purgedCount = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);

        // Assert: 0 recordings purged!
        purgedCount.Should().Be(0);

        // Assert session in DB remains unpurged
        var refreshed = await db.TeleconsultRecordingSessions.FindAsync(sessionId);
        refreshed!.IsPurged.Should().BeFalse();
        refreshed.PurgedAtUtc.Should().BeNull();

        // Assert files and sidecars STILL EXIST in sovereign storage
        storage.Files.ContainsKey(storageKey).Should().BeTrue("Encrypted segment chunk must NOT be deleted under legal hold.");
        storage.Files.ContainsKey(sidecarKey).Should().BeTrue("Sidecar key must NOT be deleted under legal hold.");
        storage.Files.ContainsKey(manifestKey).Should().BeTrue("Manifest must NOT be deleted under legal hold.");
        storage.Files.ContainsKey(manifestSidecarKey).Should().BeTrue("Manifest sidecar must NOT be deleted under legal hold.");
    }

    [Fact]
    public async Task RetentionSweeper_NormalExpiredRecording_DeletesCiphertextAndKeySidecarsCleanly()
    {
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);

        var sessionId = Guid.NewGuid();
        var storageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var sidecarKey = $"{storageKey}.key";
        var manifestKey = $"{_tenantId}/{_clinicId}/{sessionId}/manifest.json";
        var manifestSidecarKey = $"{manifestKey}.key";

        // Store segment and keys in storage
        await storage.SaveEncryptedFileAsync(storageKey, new byte[] { 1, 2, 3 });
        await storage.SaveEncryptedFileAsync(sidecarKey, Encoding.UTF8.GetBytes("{}"));
        await storage.SaveEncryptedFileAsync(manifestKey, Encoding.UTF8.GetBytes("{}"));
        await storage.SaveEncryptedFileAsync(manifestSidecarKey, Encoding.UTF8.GetBytes("{}"));

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Expired",
            DoctorId = _doctorStaffId,
            DoctorName = "Dr. Challenger M6-1",
            StoragePolicy = "WorkspaceVaultOnly",
            RecordingState = "Completed",
            ExpiresAtUtc = DateTime.UtcNow.AddDays(-1), // Expired
            IsLegalHold = false,                         // No legal hold
            IsPurged = false,
            ManifestStorageKey = manifestKey
        };
        session.Segments.Add(new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            SegmentIndex = 0,
            StorageKey = storageKey,
            Sha256Checksum = "mock-sha256",
            IvBase64 = "mock-iv",
            TagBase64 = "mock-tag"
        });

        db.TeleconsultRecordingSessions.Add(session);
        await db.SaveChangesAsync();

        var services = new ServiceCollection();
        services.AddSingleton(db);
        services.AddSingleton<IClinicStorageService>(storage);
        var sp = services.BuildServiceProvider();

        var sweeper = new RecordingRetentionSweeper(sp, NullLogger<RecordingRetentionSweeper>.Instance);

        // Act
        var purgedCount = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);

        // Assert: 1 recording purged
        purgedCount.Should().Be(1);

        // Assert session in DB marked purged
        var refreshed = await db.TeleconsultRecordingSessions.FindAsync(sessionId);
        refreshed!.IsPurged.Should().BeTrue();
        refreshed.PurgedAtUtc.Should().NotBeNull();
        refreshed.PurgedBy.Should().Be("System.RetentionSweeper");

        // Assert BOTH ciphertext and .key sidecars DELETED
        storage.Files.ContainsKey(storageKey).Should().BeFalse("Segment ciphertext must be deleted.");
        storage.Files.ContainsKey(sidecarKey).Should().BeFalse("Segment .key sidecar must be cleanly deleted.");
        storage.Files.ContainsKey(manifestKey).Should().BeFalse("Manifest file must be deleted.");
        storage.Files.ContainsKey(manifestSidecarKey).Should().BeFalse("Manifest .key sidecar must be cleanly deleted.");

        // Assert WORM Audit Log created
        var audit = await db.AuditEntries.FirstOrDefaultAsync(a => a.Action == "teleconsult.recording.purged" && a.TargetEntityId == sessionId.ToString());
        audit.Should().NotBeNull();
        audit!.Category.Should().Be(ClinicAuditCategories.Operations);
        audit.Outcome.Should().Be(ClinicAuditOutcomes.Success);
    }

    [Fact]
    public async Task RetentionSweeper_AfterLegalHoldReleased_SubsequentSweepPurgesCleanly()
    {
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);

        var sessionId = Guid.NewGuid();
        var storageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var sidecarKey = $"{storageKey}.key";

        await storage.SaveEncryptedFileAsync(storageKey, new byte[] { 10, 20 });
        await storage.SaveEncryptedFileAsync(sidecarKey, Encoding.UTF8.GetBytes("{}"));

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Legal Hold Release",
            DoctorId = _doctorStaffId,
            DoctorName = "Dr. Challenger M6-1",
            StoragePolicy = "WorkspaceVaultOnly",
            RecordingState = "Completed",
            ExpiresAtUtc = DateTime.UtcNow.AddDays(-5),
            IsLegalHold = true,
            IsPurged = false
        };
        session.Segments.Add(new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            SegmentIndex = 0,
            StorageKey = storageKey,
            Sha256Checksum = "mock-sha256",
            IvBase64 = "mock-iv",
            TagBase64 = "mock-tag"
        });

        db.TeleconsultRecordingSessions.Add(session);
        await db.SaveChangesAsync();

        var services = new ServiceCollection();
        services.AddSingleton(db);
        services.AddSingleton<IClinicStorageService>(storage);
        var sp = services.BuildServiceProvider();

        var sweeper = new RecordingRetentionSweeper(sp, NullLogger<RecordingRetentionSweeper>.Instance);

        // Sweep 1: legal hold active -> 0 purged
        var sweep1 = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);
        sweep1.Should().Be(0);

        // Release legal hold
        session.IsLegalHold = false;
        session.LegalHoldReason = null;
        await db.SaveChangesAsync();

        // Sweep 2: now purged!
        var sweep2 = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);
        sweep2.Should().Be(1);

        storage.Files.ContainsKey(storageKey).Should().BeFalse();
        storage.Files.ContainsKey(sidecarKey).Should().BeFalse();
    }

    #endregion

    #region 5. Concurrency & Race Conditions Attack Surface

    [Fact]
    public async Task Concurrency_MultiThreadedAdmission_SameAppointment_MaintainsConsistency()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Concurrent Patient",
            DoctorId = _doctorStaffId,
            DoctorName = "Dr. Challenger M6-1",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // Launch 15 concurrent threads admitting the same appointment with emergency override
        var command = new AdmitTeleconsultPatientCommand(
            appointment.Id,
            new EmergencyOverrideDto("ACUTE-CHEST-PAIN", "Concurrent stress admission justification note."));

        var results = new ConcurrentBag<TeleconsultAdmissionResultDto>();
        var exceptions = new ConcurrentBag<Exception>();

        var tasks = Enumerable.Range(0, 15).Select(async _ =>
        {
            try
            {
                var res = await handler.Handle(command, CancellationToken.None);
                results.Add(res);
            }
            catch (Exception ex)
            {
                exceptions.Add(ex);
            }
        });

        await Task.WhenAll(tasks);

        // All successful admissions must agree on AppointmentId, CallId, and RoomName
        results.Should().NotBeEmpty();
        var firstResult = results.First();
        foreach (var res in results)
        {
            res.AppointmentId.Should().Be(appointment.Id);
            res.CallId.Should().Be(firstResult.CallId);
            res.RoomName.Should().Be(firstResult.RoomName);
            res.IsEmergencyOverride.Should().BeTrue();
        }

        var refreshed = await context.Appointments.FindAsync(appointment.Id);
        refreshed!.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        refreshed.Status.Should().Be(AppointmentStatus.InConsultation);
    }

    [Fact]
    public async Task Concurrency_ParallelCallJoin_DistinctAppointments_MaintainsIsolationAndZeroPhiContracts()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var requestClient = Substitute.For<IInteropRequestClient>();
        var publisher = Substitute.For<IInteropPublisher>();

        requestClient.RequestAsync<MediaRoomRequestedPayload, MediaRoomRespondedPayload>(
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(),
            Arg.Any<MediaRoomRequestedPayload>(), Arg.Any<TimeSpan?>(), Arg.Any<CancellationToken>())
            .Returns(ci =>
            {
                var payload = ci.Arg<MediaRoomRequestedPayload>();
                var tokenDict = payload.ParticipantIdentities.ToDictionary(id => id, id => $"jwt-mock-{id}");
                return new MediaRoomRespondedPayload(
                    CallId: payload.CallId,
                    RoomName: payload.RoomName,
                    RelayUrl: "wss://livekit.internal",
                    ParticipantTokens: tokenDict,
                    Success: true,
                    ErrorMessage: null
                );
            });

        // Seed 20 distinct teleconsult appointments
        var appointments = new List<Appointment>();
        for (int i = 0; i < 20; i++)
        {
            var callId = Guid.NewGuid();
            var appt = new Appointment
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = _clinicId,
                PatientId = Guid.NewGuid(),
                PatientName = $"Patient {i}",
                DoctorId = _doctorStaffId,
                DoctorName = "Dr. Challenger M6-1",
                ScheduledAt = DateTime.UtcNow,
                DurationMinutes = 30,
                AppointmentType = AppointmentType.Teleconsult,
                PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
                PaymentStatus = TeleconsultPaymentStatus.Exempt,
                CallId = callId,
                AdmittedAtUtc = DateTime.UtcNow
            };
            appointments.Add(appt);
            context.Appointments.Add(appt);
        }
        await context.SaveChangesAsync();

        var handler = new JoinTeleconsultCallCommandHandler(
            appointmentRepo, settingsRepo, auditRepo, uow, _clinicContext,
            requestClient, publisher, NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        // Join all 20 calls concurrently
        var joinResults = new ConcurrentBag<TeleconsultCallJoinDto>();

        var tasks = appointments.Select(async appt =>
        {
            var res = await handler.Handle(new JoinTeleconsultCallCommand(appt.Id), CancellationToken.None);
            joinResults.Add(res);
        });

        await Task.WhenAll(tasks);

        joinResults.Count.Should().Be(20);

        // Assert strictly distinct CallIds and RoomNames
        var callIds = joinResults.Select(r => r.CallId).Distinct().ToList();
        callIds.Count.Should().Be(20, "All concurrent teleconsult calls must have strictly distinct CallIds.");

        var roomNames = joinResults.Select(r => r.RoomName).Distinct().ToList();
        roomNames.Count.Should().Be(20, "All concurrent teleconsult calls must have strictly distinct RoomNames.");

        // Assert all RoomNames and ParticipantIdentities conform to Zero-PHI regex
        foreach (var r in joinResults)
        {
            ZeroPhiRoomRegex.IsMatch(r.RoomName).Should().BeTrue();
            ZeroPhiParticipantRegex.IsMatch(r.ParticipantIdentity).Should().BeTrue();
        }
    }

    [Fact]
    public async Task Concurrency_PaymentConfirmedHandler_IdempotentUnderDuplicateArrivals()
    {
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var publisher = Substitute.For<IInteropPublisher>();
        var recipientResolver = new ClinicRecipientResolver(context, NullLogger<ClinicRecipientResolver>.Instance);

        context.Settings.Add(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Apex Health Clinic"
        });

        var callId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var invoiceId = Guid.NewGuid();

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Payment Test Patient",
            DoctorId = _doctorStaffId,
            DoctorName = "Dr. Challenger M6-1",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = callId,
            InvoiceId = invoiceId,
            InvoiceRequestId = invoiceId
        };
        context.Appointments.Add(appointment);

        var invoice = new Invoice
        {
            Id = invoiceId,
            AppointmentId = appointment.Id,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            InvoiceNumber = "INV-2026-TEST-001",
            PatientId = appointment.PatientId,
            PatientName = appointment.PatientName,
            GrossAmount = 500m,
            NetAmount = 500m,
            AmountPaid = 0m,
            BalanceDue = 500m,
            Status = InvoiceStatus.Draft
        };
        context.Invoices.Add(invoice);
        await context.SaveChangesAsync();

        var handler = new BillingPaymentConfirmedHandler(
            context, recipientResolver, publisher, NullLogger<BillingPaymentConfirmedHandler>.Instance);

        var payload = new BillingPaymentConfirmedPayload
        {
            InvoiceRequestId = invoiceId,
            InvoiceId = invoiceId,
            SourceType = "Teleconsult",
            SourceId = appointmentId,
            AmountDue = 500m,
            AmountPaid = 500m,
            PaymentMethod = "GCash",
            ReceiptNumber = "OR-2026-GCASH-001",
            PaidAtUtc = DateTime.UtcNow,
            FullyPaid = true
        };

        var from = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic, service: InteropServices.Billing);
        var to = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic);
        var envelope = InteropEnvelope.Create(
            type: InteropTypes.BillingPaymentConfirmed,
            from: from,
            to: to,
            correlationId: invoiceId,
            payload: payload
        );
        var msgContext = new InteropMessageContext(envelope);

        // Fire 10 duplicate/concurrent arrivals of BillingPaymentConfirmed
        var tasks = Enumerable.Range(0, 10).Select(_ => handler.HandleAsync(payload, msgContext, CancellationToken.None));
        await Task.WhenAll(tasks);

        // Assert invoice settled exactly once
        var refreshedInvoice = await context.Invoices.Include(i => i.Payments).FirstOrDefaultAsync(i => i.Id == invoiceId);
        refreshedInvoice!.Status.Should().Be(InvoiceStatus.Paid);
        refreshedInvoice.AmountPaid.Should().Be(500m);
        refreshedInvoice.BalanceDue.Should().Be(0m);
        refreshedInvoice.Payments.Sum(p => p.Amount).Should().Be(500m, "Payments must not be double-recorded on duplicate arrivals.");

        // Assert appointment gate opened
        var refreshedAppt = await context.Appointments.FindAsync(appointment.Id);
        refreshedAppt!.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        refreshedAppt.PaymentReceiptNumber.Should().Be("OR-2026-GCASH-001");

        // Publisher should have enqueued CommsCallPaymentCleared
        publisher.Received().Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            callId,
            Arg.Is<CommsCallPaymentClearedPayload>(p =>
                p.CallId == callId &&
                p.PaymentMethod == "GCash" &&
                p.IsEmergencyOverride == false)
        );
    }

    #endregion
}
