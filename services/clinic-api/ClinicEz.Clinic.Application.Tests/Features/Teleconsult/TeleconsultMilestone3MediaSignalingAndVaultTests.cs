using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Queries;
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

public sealed class TeleconsultMilestone3MediaSignalingAndVaultTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-m3-test";
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;

    public TeleconsultMilestone3MediaSignalingAndVaultTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
        _clinicContext.StaffName.Returns("Dr. Jose Rizal");
        _clinicContext.StaffRole.Returns("Doctor");
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsRead).Returns(true);
    }

    // =========================================================================
    // 1. JoinTeleconsultCallCommand Tests
    // =========================================================================

    [Fact]
    public async Task JoinCall_WithoutPermission_ThrowsForbiddenException()
    {
        var ctx = Substitute.For<IClinicContext>();
        ctx.ClinicId.Returns(_clinicId);
        ctx.TenantId.Returns(_tenantId);
        ctx.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(false);
        ctx.HasPermission(ClinicPermissions.ConsultationsSign).Returns(false);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(ctx);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var requestClient = Substitute.For<IInteropRequestClient>();
        var publisher = Substitute.For<IInteropPublisher>();

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, ctx, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var act = () => handler.Handle(new JoinTeleconsultCallCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*ConsultationsWrite or ConsultationsSign*");
    }

    [Fact]
    public async Task JoinCall_WhenAppointmentNotFound_ThrowsNotFoundException()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var requestClient = Substitute.For<IInteropRequestClient>();
        var publisher = Substitute.For<IInteropPublisher>();

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var missingId = Guid.NewGuid();
        var act = () => handler.Handle(new JoinTeleconsultCallCommand(missingId), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>()
            .WithMessage($"*{missingId}*");
    }

    [Fact]
    public async Task JoinCall_WhenNotTeleconsult_ThrowsBadRequestException()
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
            PatientName = "InPerson Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.InPerson,
            CallId = null
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var act = () => handler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*not a teleconsultation*");
    }

    [Fact]
    public async Task JoinCall_WhenTeleconsultHasNoCallId_ThrowsInvalidOperationException()
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
            PatientName = "No CallId Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = null // Missing CallId!
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var act = () => handler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*not a teleconsultation or has no CallId*");
    }

    [Fact]
    public async Task JoinCall_WhenPatientNotAdmittedAndUnpaidPrepaid_ThrowsTeleconsultPaymentRequiredException()
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
            PatientName = "Unadmitted Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = Guid.NewGuid(),
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            AdmittedAtUtc = null
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var act = () => handler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);

        await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
    }

    [Fact]
    public async Task JoinCall_WhenPatientNotAdmittedAndPostpaid_ThrowsInvalidOperationException()
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
            PatientName = "Postpaid Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = Guid.NewGuid(),
            PaymentPolicy = TeleconsultPaymentPolicy.Postpaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            AdmittedAtUtc = null
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var act = () => handler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Patient has not been admitted*");
    }

    [Fact]
    public async Task JoinCall_WhenMediaBrokerResponds_ReturnsActiveTokensAndEnqueuesEvent()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var requestClient = Substitute.For<IInteropRequestClient>();
        var publisher = Substitute.For<IInteropPublisher>();

        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var staffIdentity = $"staff:{_staffId:N}";
        var patientIdentity = $"patient:{patientId:N}";

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Juan Luna",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
            PaymentStatus = TeleconsultPaymentStatus.Exempt,
            AdmittedAtUtc = DateTime.UtcNow.AddMinutes(-5)
        };
        await aptRepo.AddAsync(apt);

        var settings = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Test Clinic",
            TeleconsultRecordingPolicy = "WorkspaceVaultOnly",
            TeleconsultRecordingRetentionDays = 180,
            TeleconsultRecordingConsentRequired = true
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var tokens = new Dictionary<string, string>
        {
            [staffIdentity] = "livekit-token-doctor-secret-jwt",
            [patientIdentity] = "livekit-token-patient-secret-jwt"
        };
        var mediaResponse = new MediaRoomRespondedPayload(
            CallId: callId,
            RoomName: $"call-{callId:N}",
            RelayUrl: "wss://livekit.clinicez.internal",
            ParticipantTokens: tokens,
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

        result.Should().NotBeNull();
        result.AppointmentId.Should().Be(apt.Id);
        result.CallId.Should().Be(callId);
        result.RoomName.Should().Be($"call-{callId:N}");
        result.MediaAvailable.Should().BeTrue();
        result.IsFallbackToken.Should().BeFalse();
        result.ClinicianToken.Should().Be("livekit-token-doctor-secret-jwt");
        result.AccessToken.Should().Be("livekit-token-doctor-secret-jwt");
        result.Token.Should().Be("livekit-token-doctor-secret-jwt");
        result.RelayUrl.Should().Be("wss://livekit.clinicez.internal");
        result.LiveKitServerUrl.Should().Be("wss://livekit.clinicez.internal");
        result.RecordingPolicy.Should().Be("WorkspaceVaultOnly");
        result.RecordingConsentRequired.Should().BeTrue();

        // Verify comms.call.state.changed event was published
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallStateChanged,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            callId,
            Arg.Is<CommsCallStateChangedPayload>(p =>
                p.CallId == callId &&
                p.Status == "Admitted" &&
                p.RoomName == $"call-{callId:N}" &&
                p.JoinToken == "livekit-token-patient-secret-jwt"));

        // Verify WORM audit log was recorded
        var audits = await auditRepo.Query().ToListAsync();
        audits.Should().ContainSingle();
        audits[0].Action.Should().Be("teleconsult.call.joined");
        audits[0].TargetEntityId.Should().Be(apt.Id.ToString());
    }

    [Fact]
    public async Task JoinCall_WhenMediaBrokerTimesOut_GracefullyFallsBackToOfflineTokens()
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
            PatientName = "Marcelo H. Del Pilar",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
            PaymentStatus = TeleconsultPaymentStatus.Exempt,
            AdmittedAtUtc = DateTime.UtcNow.AddMinutes(-2)
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        requestClient.RequestAsync<MediaRoomRequestedPayload, MediaRoomRespondedPayload>(
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(),
            Arg.Any<MediaRoomRequestedPayload>(), Arg.Any<TimeSpan?>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromException<MediaRoomRespondedPayload>(new InteropRequestTimeoutException(InteropTypes.MediaRoomRequested, callId, TimeSpan.FromSeconds(10))));

        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance);

        var result = await handler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);

        result.Should().NotBeNull();
        result.MediaAvailable.Should().BeFalse();
        result.IsFallbackToken.Should().BeTrue();
        result.MediaStatusMessage.Should().Contain("Media broker unavailable. Call state maintained in offline signaling mode.");
        result.ClinicianToken.Should().StartWith("fallback-token-");
        result.AccessToken.Should().StartWith("fallback-token-");

        // Event must still be published with fallback token
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallStateChanged,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            callId,
            Arg.Is<CommsCallStateChangedPayload>(p =>
                p.CallId == callId &&
                p.Status == "Admitted" &&
                p.JoinToken!.StartsWith("fallback-token-")));
    }

    // =========================================================================
    // 2. EndTeleconsultCallCommand Tests
    // =========================================================================

    [Fact]
    public async Task EndCall_WithoutPermission_ThrowsForbiddenException()
    {
        var ctx = Substitute.For<IClinicContext>();
        ctx.ClinicId.Returns(_clinicId);
        ctx.TenantId.Returns(_tenantId);
        ctx.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(false);
        ctx.HasPermission(ClinicPermissions.ConsultationsSign).Returns(false);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(ctx);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var sender = Substitute.For<ISender>();

        var handler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, ctx, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        var act = () => handler.Handle(new EndTeleconsultCallCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task EndCall_AutoFinalizesActiveRecordingSession_AndCompletesAppointment()
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
            PatientName = "Apolinario Mabini",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            Status = AppointmentStatus.InConsultation,
            AdmittedAtUtc = DateTime.UtcNow.AddMinutes(-30)
        };
        await aptRepo.AddAsync(apt);

        var recordingSession = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = callId,
            AppointmentId = apt.Id,
            PatientId = apt.PatientId,
            PatientName = apt.PatientName,
            DoctorId = _staffId,
            DoctorName = "Dr. Rizal",
            RecordingState = "Recording",
            ConsentStatus = "Consented",
            StoragePolicy = "WorkspaceVaultOnly"
        };
        await sessionRepo.AddAsync(recordingSession);
        await uow.SaveChangesAsync();

        sender.Send(Arg.Is<FinalizeRecordingSessionCommand>(c => c.SessionId == recordingSession.Id), Arg.Any<CancellationToken>())
            .Returns(new RecordingSessionDto(
                recordingSession.Id, _clinicId, callId, apt.Id, null, apt.PatientId, apt.PatientName,
                _staffId, "Dr. Rizal", "Consented", "Completed", "WorkspaceVaultOnly",
                120, 2, 500000, "video/webm", "key/manifest.cez", false, 90, null, false, null, false));

        var handler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        var result = await handler.Handle(new EndTeleconsultCallCommand(apt.Id, "Consultation concluded successfully"), CancellationToken.None);

        result.Should().NotBeNull();
        result.AppointmentId.Should().Be(apt.Id);
        result.CallId.Should().Be(callId);
        result.Status.Should().Be("Ended");
        result.RecordingFinalized.Should().BeTrue();
        result.WormAuditLogged.Should().BeTrue();
        result.CommsCallStateChangedEnqueued.Should().BeTrue();

        // Verify appointment transitioned to Completed
        var updatedApt = await aptRepo.Query().FirstAsync(a => a.Id == apt.Id);
        updatedApt.Status.Should().Be(AppointmentStatus.Completed);

        // Verify sender was called to finalize session
        await sender.Received(1).Send(Arg.Is<FinalizeRecordingSessionCommand>(c => c.SessionId == recordingSession.Id), Arg.Any<CancellationToken>());

        // Verify comms.call.state.changed was published with Ended status
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallStateChanged,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            callId,
            Arg.Is<CommsCallStateChangedPayload>(p =>
                p.CallId == callId &&
                p.Status == "Ended" &&
                p.StateVersion == 2));

        // Verify WORM audit
        var audits = await auditRepo.Query().ToListAsync();
        audits.Should().ContainSingle();
        audits[0].Action.Should().Be("teleconsult.call.ended");
    }

    // =========================================================================
    // 3. Consultation Linkage & GetConsultationRecordingQuery Tests
    // =========================================================================

    [Fact]
    public async Task CreateConsultation_LinksUnattachedRecordingSession_ToEncounter()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);

        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = callId,
            AppointmentId = aptId,
            ConsultationId = null, // Unlinked
            PatientId = patientId,
            PatientName = "Melchora Aquino",
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

        var command = new CreateConsultationCommand(
            PatientId: patientId,
            PatientName: "Melchora Aquino",
            DoctorId: _staffId,
            DoctorName: "Dr. Rizal",
            Subjective: "Headache and fatigue",
            Objective: "BP normal",
            Assessment: "Tension headache",
            Plan: "Rest and hydration",
            AppointmentId: aptId);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();

        // Verify session now has ConsultationId pointing to the new encounter
        var updatedSession = await sessionRepo.Query().FirstAsync(s => s.Id == session.Id);
        updatedSession.ConsultationId.Should().Be(result.Id);
    }

    [Fact]
    public async Task CreateConsultation_WhenSessionAlreadyLinkedToDifferentConsultation_ThrowsInvalidOperationException()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);

        var aptId = Guid.NewGuid();
        var existingConsultationId = Guid.NewGuid();

        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            AppointmentId = aptId,
            ConsultationId = existingConsultationId, // Already linked to different encounter!
            PatientId = Guid.NewGuid(),
            PatientName = "Andres Bonifacio",
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

        var command = new CreateConsultationCommand(
            PatientId: session.PatientId,
            PatientName: session.PatientName,
            DoctorId: _staffId,
            DoctorName: "Dr. Rizal",
            Subjective: "Second opinion attempt",
            Objective: "Normal",
            Assessment: "None",
            Plan: "None",
            AppointmentId: aptId);

        var act = () => handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage($"*already linked to consultation {existingConsultationId}*");
    }

    [Fact]
    public async Task GetConsultationRecording_FallsBackToAppointmentId_WhenConsultationIdNotDirectlyStamped()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);

        var aptId = Guid.NewGuid();
        var consultationId = Guid.NewGuid();

        var encounter = new ConsultationEncounter
        {
            Id = consultationId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Diego Silang",
            DoctorId = _staffId,
            DoctorName = "Dr. Rizal",
            AppointmentId = aptId, // Linked to appointment!
            EncounterDate = DateTime.UtcNow
        };
        await consultRepo.AddAsync(encounter);

        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            AppointmentId = aptId,
            ConsultationId = null, // Direct link missing!
            PatientId = encounter.PatientId,
            PatientName = "Diego Silang",
            DoctorId = _staffId,
            DoctorName = "Dr. Rizal",
            RecordingState = "Completed",
            StoragePolicy = "WorkspaceVaultOnly"
        };
        await sessionRepo.AddAsync(session);
        await uow.SaveChangesAsync();

        var queryHandler = new GetConsultationRecordingQueryHandler(sessionRepo, _clinicContext, consultRepo);

        var result = await queryHandler.Handle(new GetConsultationRecordingQuery(consultationId), CancellationToken.None);

        result.Should().NotBeNull();
        result!.Id.Should().Be(session.Id);
        result.AppointmentId.Should().Be(aptId);
    }

    // =========================================================================
    // 4. CommsRecordingConsentLoggedHandler Tests
    // =========================================================================

    [Fact]
    public async Task ConsentLoggedHandler_WhenConsented_TransitionsToReadyToRecord()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var recipient = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);

        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var consentId = Guid.NewGuid();

        var settings = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Test Clinic",
            TeleconsultRecordingPolicy = "WorkspaceVaultOnly",
            TeleconsultRecordingRetentionDays = 90
        };
        db.Settings.Add(settings);

        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = callId,
            PatientId = patientId,
            PatientName = "Gabriela Silang",
            DoctorId = _staffId,
            DoctorName = "Dr. Rizal",
            RecordingState = "PendingConsent",
            ConsentStatus = "NotRequested",
            StoragePolicy = "WorkspaceVaultOnly"
        };
        db.TeleconsultRecordingSessions.Add(session);
        await db.SaveChangesAsync();

        var handler = new CommsRecordingConsentLoggedHandler(db, recipient, NullLogger<CommsRecordingConsentLoggedHandler>.Instance);

        var loggedAt = DateTime.UtcNow;
        var payload = new CommsRecordingConsentLoggedPayload(
            ConsentId: consentId,
            CallId: callId,
            TenantId: _tenantId,
            FacilityId: _clinicId.ToString(),
            PatientId: patientId,
            TargetPolicy: "WorkspaceVaultOnly",
            Decision: "Consented",
            Version: 1,
            LoggedAtUtc: loggedAt);

        var from = Party.ForFacility("comms-tenant", Guid.NewGuid().ToString(), FacilityType.Clinic, InteropServices.Comms);
        var to = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic);
        var context = MessagingTestKit.Delivered(InteropTypes.CommsRecordingConsentLogged, from, to, callId, payload);

        await handler.HandleAsync(payload, context, CancellationToken.None);

        var updatedSession = await db.TeleconsultRecordingSessions.FirstAsync(s => s.Id == session.Id);
        updatedSession.ConsentStatus.Should().Be("Consented");
        updatedSession.RecordingState.Should().Be("ReadyToRecord");
        updatedSession.PatientConsentAtUtc.Should().Be(loggedAt);

        var audit = await db.AuditEntries.FirstOrDefaultAsync(a => a.Action == "teleconsult.recording.consent_logged");
        audit.Should().NotBeNull();
        audit!.Outcome.Should().Be(ClinicAuditOutcomes.Success);
    }

    [Fact]
    public async Task ConsentLoggedHandler_WhenDeclined_TransitionsToBlocked()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var recipient = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);

        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var settings = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Test Clinic",
            TeleconsultRecordingPolicy = "WorkspaceVaultOnly",
            TeleconsultRecordingRetentionDays = 90
        };
        db.Settings.Add(settings);

        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = callId,
            PatientId = patientId,
            PatientName = "Emilio Jacinto",
            DoctorId = _staffId,
            DoctorName = "Dr. Rizal",
            RecordingState = "PendingConsent",
            ConsentStatus = "NotRequested",
            StoragePolicy = "WorkspaceVaultOnly"
        };
        db.TeleconsultRecordingSessions.Add(session);
        await db.SaveChangesAsync();

        var handler = new CommsRecordingConsentLoggedHandler(db, recipient, NullLogger<CommsRecordingConsentLoggedHandler>.Instance);

        var payload = new CommsRecordingConsentLoggedPayload(
            ConsentId: Guid.NewGuid(),
            CallId: callId,
            TenantId: _tenantId,
            FacilityId: _clinicId.ToString(),
            PatientId: patientId,
            TargetPolicy: "WorkspaceVaultOnly",
            Decision: "Declined",
            Version: 1,
            LoggedAtUtc: DateTime.UtcNow);

        var from = Party.ForFacility("comms-tenant", Guid.NewGuid().ToString(), FacilityType.Clinic, InteropServices.Comms);
        var to = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic);
        var context = MessagingTestKit.Delivered(InteropTypes.CommsRecordingConsentLogged, from, to, callId, payload);

        await handler.HandleAsync(payload, context, CancellationToken.None);

        var updatedSession = await db.TeleconsultRecordingSessions.FirstAsync(s => s.Id == session.Id);
        updatedSession.ConsentStatus.Should().Be("Declined");
        updatedSession.RecordingState.Should().Be("Blocked");
        updatedSession.RejectionReason.Should().Contain("declined");

        var audit = await db.AuditEntries.FirstOrDefaultAsync(a => a.Action == "teleconsult.recording.consent_logged");
        audit.Should().NotBeNull();
        audit!.Outcome.Should().Be(ClinicAuditOutcomes.Warning);
    }

    // =========================================================================
    // 5. RecordingRetentionSweeper Tests
    // =========================================================================

    [Fact]
    public async Task RetentionSweeper_DeletesSegmentAndKeySidecars_WhenSessionExpired()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var storage = Substitute.For<IClinicStorageService>();

        var expiredDate = DateTime.UtcNow.AddDays(-10);
        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Tandang Sora",
            DoctorName = "Dr. Rizal",
            ExpiresAtUtc = expiredDate,
            IsLegalHold = false,
            IsPurged = false,
            RetentionPolicyDays = 30,
            ManifestStorageKey = "vault/case-m3/manifest.cez",
            Segments = new List<TeleconsultRecordingSegment>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    ClinicId = _clinicId,
                    TenantId = _tenantId,
                    SegmentIndex = 0,
                    StorageKey = "vault/case-m3/seg_00000.cez",
                    Sha256Checksum = "checksum0",
                    IvBase64 = "iv0",
                    TagBase64 = "tag0"
                }
            }
        };
        context.TeleconsultRecordingSessions.Add(session);
        await context.SaveChangesAsync();

        // Simulate sidecars existing in storage
        storage.FileExistsAsync("vault/case-m3/seg_00000.cez.key", Arg.Any<CancellationToken>()).Returns(true);
        storage.FileExistsAsync("vault/case-m3/manifest.cez.key", Arg.Any<CancellationToken>()).Returns(true);

        var services = new ServiceCollection();
        services.AddSingleton(context);
        services.AddSingleton(storage);
        var sp = services.BuildServiceProvider();

        var sweeper = new RecordingRetentionSweeper(sp, NullLogger<RecordingRetentionSweeper>.Instance);

        var purgedCount = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);

        purgedCount.Should().Be(1);

        // Verify segment and sidecar deletions
        await storage.Received(1).DeleteEncryptedFileAsync("vault/case-m3/seg_00000.cez", Arg.Any<CancellationToken>());
        await storage.Received(1).DeleteEncryptedFileAsync("vault/case-m3/seg_00000.cez.key", Arg.Any<CancellationToken>());

        // Verify manifest and sidecar deletions
        await storage.Received(1).DeleteEncryptedFileAsync("vault/case-m3/manifest.cez", Arg.Any<CancellationToken>());
        await storage.Received(1).DeleteEncryptedFileAsync("vault/case-m3/manifest.cez.key", Arg.Any<CancellationToken>());

        // Verify session marked purged
        session.IsPurged.Should().BeTrue();
    }

    // =========================================================================
    // 6. Controller Tests
    // =========================================================================

    [Fact]
    public async Task AdmissionController_JoinCall_ReturnsSuccessApiResponse()
    {
        var sender = Substitute.For<ISender>();
        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();

        var joinDto = new TeleconsultCallJoinDto(
            AppointmentId: aptId,
            CallId: callId,
            RoomName: $"call-{callId:N}",
            RelayUrl: "wss://livekit.clinicez.internal",
            ClinicianToken: "jwt-token-clinician",
            ParticipantIdentity: "staff:123",
            MediaAvailable: true,
            MediaStatusMessage: null,
            RecordingPolicy: "Disabled",
            RecordingConsentRequired: true,
            AccessToken: "jwt-token-clinician",
            Token: "jwt-token-clinician",
            LiveKitServerUrl: "wss://livekit.clinicez.internal");

        sender.Send(Arg.Is<JoinTeleconsultCallCommand>(c => c.AppointmentId == aptId), Arg.Any<CancellationToken>())
            .Returns(joinDto);

        var controller = new TeleconsultAdmissionController(sender);

        var response = await controller.JoinCall(aptId, CancellationToken.None);

        var okResult = response.Result.Should().BeOfType<OkObjectResult>().Subject;
        var apiResponse = okResult.Value.Should().BeOfType<ApiResponse<TeleconsultCallJoinDto>>().Subject;
        apiResponse.Succeeded.Should().BeTrue();
        apiResponse.Data!.CallId.Should().Be(callId);
    }

    [Fact]
    public async Task AdmissionController_EndCall_ReturnsSuccessApiResponse()
    {
        var sender = Substitute.For<ISender>();
        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();

        var endDto = new TeleconsultCallEndResultDto(
            AppointmentId: aptId,
            CallId: callId,
            RoomName: $"call-{callId:N}",
            EndedAtUtc: DateTime.UtcNow,
            Status: "Ended",
            RecordingFinalized: true,
            WormAuditLogged: true,
            CommsCallStateChangedEnqueued: true);

        sender.Send(Arg.Is<EndTeleconsultCallCommand>(c => c.AppointmentId == aptId && c.EndReason == "Done"), Arg.Any<CancellationToken>())
            .Returns(endDto);

        var controller = new TeleconsultAdmissionController(sender);

        var response = await controller.EndCall(aptId, new EndTeleconsultCallRequest("Done"), CancellationToken.None);

        var okResult = response.Result.Should().BeOfType<OkObjectResult>().Subject;
        var apiResponse = okResult.Value.Should().BeOfType<ApiResponse<TeleconsultCallEndResultDto>>().Subject;
        apiResponse.Succeeded.Should().BeTrue();
        apiResponse.Data!.Status.Should().Be("Ended");
    }

    [Fact]
    public async Task RecordingsController_UploadSegment_WithoutClientHeaders_AppliesCmkEnvelopeEncryption()
    {
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();
        var storage = Substitute.For<IClinicStorageService>();
        var encryptionService = Substitute.For<IClinicEncryptionService>();
        var config = Substitute.For<IConfiguration>();

        var sessionId = Guid.NewGuid();
        var rawMediaBytes = Encoding.UTF8.GetBytes("RAW_BROWSER_WEBM_MEDIA_CHUNK_DATA");

        var encryptedPayload = new ClinicEncryptedPayload(
            Ciphertext: Encoding.UTF8.GetBytes("ENCRYPTED_CIPHERTEXT_BYTES"),
            IvBase64: "dGVzdC1pdi0xMg==",
            TagBase64: "dGVzdC10YWctMTY=",
            EncryptedHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            EncryptedSizeBytes: 26,
            WrappedKeyJson: "{\"Alg\":\"AES-256-GCM\",\"Kid\":\"cmk-v1\"}");

        encryptionService.EncryptAsync(Arg.Any<Stream>(), _tenantId, _clinicId, Arg.Any<CancellationToken>())
            .Returns(encryptedPayload);

        var segmentDto = new RecordingSegmentDto(
            Id: Guid.NewGuid(),
            SessionId: sessionId,
            SegmentIndex: 0,
            DurationMs: 10000,
            StorageKey: $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez",
            SizeBytes: 26,
            Sha256Checksum: encryptedPayload.EncryptedHash,
            ReceivedAtUtc: DateTime.UtcNow);

        sender.Send(Arg.Any<UploadRecordingSegmentCommand>(), Arg.Any<CancellationToken>())
            .Returns(segmentDto);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, encryptionService, config, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers["X-Segment-Index"] = "0";
        httpContext.Request.Headers["X-Segment-Duration-Ms"] = "10000";
        // Client encryption headers missing!
        httpContext.Request.Body = new MemoryStream(rawMediaBytes);
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        var result = await controller.UploadSegment(sessionId, CancellationToken.None);

        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var apiResponse = okResult.Value.Should().BeOfType<ApiResponse<RecordingSegmentDto>>().Subject;
        apiResponse.Succeeded.Should().BeTrue();

        // Verify CMK encryption service was invoked
        await encryptionService.Received(1).EncryptAsync(Arg.Any<Stream>(), _tenantId, _clinicId, Arg.Any<CancellationToken>());

        // Verify storage received ciphertext segment file
        await storage.Received(1).SaveEncryptedFileAsync(
            $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez",
            encryptedPayload.Ciphertext,
            Arg.Any<CancellationToken>());

        // Verify storage received wrapped DEK sidecar file
        await storage.Received(1).SaveEncryptedFileAsync(
            $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez.key",
            Arg.Is<byte[]>(b => Encoding.UTF8.GetString(b) == encryptedPayload.WrappedKeyJson),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RecordingsController_StreamRecording_WithValidHmacAndSidecar_DecryptsAndReturnsSeekableStream()
    {
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();
        var storage = Substitute.For<IClinicStorageService>();
        var encryptionService = Substitute.For<IClinicEncryptionService>();
        var config = Substitute.For<IConfiguration>();

        var signingKey = "test-signing-key-very-secret-2026";
        config["RecordingPlayback:SigningKey"].Returns(signingKey);

        var sessionId = Guid.NewGuid();
        var callId = Guid.NewGuid();

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = callId,
            PatientName = "Antonio Luna",
            DoctorName = "Dr. Rizal",
            ContainerFormat = "video/webm",
            RecordingState = "Completed"
        };
        db.TeleconsultRecordingSessions.Add(session);

        var segment = new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            SegmentIndex = 0,
            StorageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez",
            Sha256Checksum = "hash123",
            IvBase64 = "iv123",
            TagBase64 = "tag123"
        };
        db.TeleconsultRecordingSegments.Add(segment);
        await db.SaveChangesAsync();

        // Generate valid 15-minute ticket
        var expiresTicks = DateTime.UtcNow.AddMinutes(15).Ticks;
        var payload = $"{sessionId:N}:{_clinicId:N}:{expiresTicks}:{_staffId}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(signingKey));
        var signature = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
        var ticket = $"{payload}.{signature}";

        // Mock sidecar file existing
        var sidecarKey = segment.StorageKey + ".key";
        var wrappedKeyJson = "{\"Alg\":\"AES-256-GCM\",\"Kid\":\"cmk-v1\"}";
        storage.FileExistsAsync(sidecarKey, Arg.Any<CancellationToken>()).Returns(true);
        storage.ReadEncryptedFileAsync(sidecarKey, Arg.Any<CancellationToken>())
            .Returns(Encoding.UTF8.GetBytes(wrappedKeyJson));

        var ciphertextBytes = Encoding.UTF8.GetBytes("CIPHERTEXT_STREAM_DATA");
        storage.OpenReadEncryptedStreamAsync(segment.StorageKey, Arg.Any<CancellationToken>())
            .Returns(new MemoryStream(ciphertextBytes));

        var decryptedPlaintextBytes = Encoding.UTF8.GetBytes("PLAYABLE_DECRYPTED_WEBM_VIDEO_DATA");
        encryptionService.DecryptToStreamAsync(
            Arg.Any<Stream>(), segment.IvBase64, segment.TagBase64, wrappedKeyJson, _tenantId, _clinicId, Arg.Any<CancellationToken>())
            .Returns(new MemoryStream(decryptedPlaintextBytes));

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, encryptionService, config, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var actionResult = await controller.StreamRecording(sessionId, ticket, segmentIndex: 0, CancellationToken.None);

        var fileResult = actionResult.Should().BeOfType<FileStreamResult>().Subject;
        fileResult.ContentType.Should().Be("video/webm");
        fileResult.EnableRangeProcessing.Should().BeTrue(); // Confirms HTTP 206 partial content support!

        using var memoryStream = new MemoryStream();
        await fileResult.FileStream.CopyToAsync(memoryStream);
        memoryStream.ToArray().Should().Equal(decryptedPlaintextBytes);
    }

    [Fact]
    public async Task RecordingsController_GetAppointmentRecordings_ReturnsList()
    {
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();
        var storage = Substitute.For<IClinicStorageService>();
        var encryptionService = Substitute.For<IClinicEncryptionService>();
        var config = Substitute.For<IConfiguration>();

        var aptId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            AppointmentId = aptId,
            PatientName = "Graciano Lopez Jaena",
            DoctorName = "Dr. Rizal",
            RecordingState = "Completed"
        };
        db.TeleconsultRecordingSessions.Add(session);
        await db.SaveChangesAsync();

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, encryptionService, config, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var response = await controller.GetAppointmentRecordings(aptId, CancellationToken.None);

        var okResult = response.Result.Should().BeOfType<OkObjectResult>().Subject;
        var apiResponse = okResult.Value.Should().BeOfType<ApiResponse<IReadOnlyList<RecordingSessionDto>>>().Subject;
        apiResponse.Succeeded.Should().BeTrue();
        apiResponse.Data.Should().ContainSingle();
        apiResponse.Data![0].AppointmentId.Should().Be(aptId);
    }
}
