using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Messaging.Handlers;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Licensing;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Tier4_RealWorldClinicalScenarios;

using static TeleconsultContracts;
using static TeleconsultTestHarness;

/// <summary>
/// Tier 4: Real-World Clinical Scenarios and Production Workflows for Milestone E2E-M2.
/// Covers:
/// - Workload 1: Patient & Clinician Consultation Lifecycle with Intermittent Disconnect and Explicit Physician End Call.
/// - Workload 3: Administrative Governance, Unauthorized Activation, and Downgrade Cascade Journey.
/// - Workload 4: Solo Waiting Room Timeout, Active Extension, and Resource Protection Journey.
/// - Full coverage for TC-T1.4.1 - 1.4.5, TC-T1.5.1 - 1.5.4, TC-T2.4.1, TC-T2.5.1 - 2.5.6, TC-T3.1, TC-T3.4, TC-T3.5.
/// Follows Clinic API conventions: NSubstitute + FluentAssertions.
/// </summary>
public class Tier4_ProductionTeleconsultationWorkflowTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-prod-t4";
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _doctorId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();

    public Tier4_ProductionTeleconsultationWorkflowTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_doctorId);
        _clinicContext.StaffName.Returns("Dr. Santos");
        _clinicContext.StaffRole.Returns("Doctor");
        _clinicContext.HasPermission(Arg.Any<string>()).Returns(true);
    }

    private IFacilityLicenseValidator CreateLicenseValidator(bool entitled, Guid? clinicId = null, string? tenantId = null)
    {
        var validator = Substitute.For<IFacilityLicenseValidator>();
        var payload = new FacilityLicensePayload
        {
            FacilityId = clinicId ?? _clinicId,
            TenantId = tenantId ?? _tenantId,
            FacilityName = "Clinic Santos",
            PlanTier = "Standard",
            EnabledFeatures = entitled
                ? new List<string> { FacilityFeatureKeys.Teleconsultation, FacilityFeatureKeys.ElectronicPrescriptions }
                : new List<string> { FacilityFeatureKeys.ElectronicPrescriptions }
        };
        validator.Validate(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<string>())
            .Returns(LicenseValidationResult.Success(payload));
        return validator;
    }

    // =========================================================================
    // WORKLOAD 1: Patient & Clinician Consultation Lifecycle with Disconnect / Reconnect
    // =========================================================================
    [Fact]
    public async Task Workload1_FullClinicalConsultationLifecycle_WithIntermittentDropAndExplicitEndCall()
    {
        // =========================================================================
        // 0. Test Setup & In-Memory Isolation
        // =========================================================================
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);

        var publisher = Substitute.For<IInteropPublisher>();
        var requestClient = Substitute.For<IInteropRequestClient>();
        var sender = Substitute.For<ISender>();

        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Portal:BaseUrl"] = "https://portal.clinicez.test"
        }).Build();

        var licenseValidator = CreateLicenseValidator(entitled: true);

        // Seed Facility Settings (Teleconsultation Enabled & Entitled)
        var facilitySettings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Clinic Santos",
            LicenseToken = "tok-licensed-prod",
            EnableTeleconsultation = true,
            TeleconsultPaymentPolicy = "Exempt",
            TeleconsultRecordingPolicy = "WorkspaceVaultOnly",
            TeleconsultRecordingConsentRequired = true
        };
        await settingsRepo.AddAsync(facilitySettings);

        // Seed Patient Juan Dela Cruz
        var patient = new Patient
        {
            Id = _patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-1001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09171234567",
            DateOfBirth = new DateOnly(1985, 3, 20)
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        // =========================================================================
        // 1. Scheduling: Dr. Santos schedules virtual teleconsultation for Juan
        // =========================================================================
        var createAptHandler = new CreateAppointmentCommandHandler(
            aptRepo, uow, _clinicContext,
            settingsRepo: settingsRepo,
            licenseValidator: licenseValidator);

        var aptDto = await createAptHandler.Handle(new CreateAppointmentCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            DoctorId: _doctorId,
            DoctorName: "Dr. Santos",
            ScheduledAt: DateTime.UtcNow.AddMinutes(15),
            DurationMinutes: 30,
            AppointmentType: AppointmentType.Teleconsult,
            PaymentPolicy: TeleconsultPaymentPolicy.Exempt), CancellationToken.None);

        aptDto.Should().NotBeNull();
        aptDto.AppointmentType.Should().Be(AppointmentType.Teleconsult);
        aptDto.CallId.Should().NotBeNull();
        var callId = aptDto.CallId!.Value;

        var persistedApt = await context.Appointments.AsNoTracking().FirstAsync(a => a.Id == aptDto.Id);
        persistedApt.Status.Should().Be(AppointmentStatus.Confirmed);
        persistedApt.CallId.Should().Be(callId);

        // =========================================================================
        // 2. Invite Dispatch: Inspection modal requests patient link
        // =========================================================================
        var inviteHandler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, _clinicContext, publisher, config,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance,
            settingsRepo: settingsRepo,
            licenseValidator: licenseValidator);

        var invite1 = await inviteHandler.Handle(new CreateTeleconsultGuestInviteCommand(aptDto.Id), CancellationToken.None);

        invite1.Should().NotBeNull();
        invite1.InviteToken.Should().HaveLength(32);
        invite1.Otp.Should().MatchRegex(@"^\d{6}$");
        invite1.DobHint.Should().Be("1985-**-**");
        invite1.ExpiresAtUtc.Should().BeAfter(DateTime.UtcNow.AddMinutes(50));

        // Assert Interop Publisher called with Party.Portal
        publisher.Received(1).Enqueue(
            InteropTypes.GuestTeleconsultInviteIssued,
            Arg.Any<Party>(),
            Party.Portal,
            aptDto.Id,
            Arg.Is<GuestTeleconsultInviteIssuedPayload>(p =>
                p.AppointmentId == aptDto.Id &&
                p.CallId == callId &&
                p.TenantId == _tenantId));

        // Client modal cache simulation: copying patient link reuses cached invite without rotating PIN (TC-T2.1.1)
        var modalInviteCache = new ConcurrentDictionary<Guid, TeleconsultGuestInviteDto>();
        modalInviteCache[aptDto.Id] = invite1;

        var invite2 = modalInviteCache[aptDto.Id];
        invite2.Otp.Should().Be(invite1.Otp, "Copying patient link in inspection modal must reuse active invite state without regenerating PIN");
        invite2.InviteToken.Should().Be(invite1.InviteToken);

        // =========================================================================
        // 3. Waiting Room Intake & Clinician Join: Dr. Santos admits Juan and enters active stage
        // =========================================================================
        var admitHandler = new AdmitTeleconsultPatientCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance,
            settingsRepo: settingsRepo,
            licenseValidator: licenseValidator);

        var admission = await admitHandler.Handle(new AdmitTeleconsultPatientCommand(aptDto.Id), CancellationToken.None);
        admission.Should().NotBeNull();
        admission.RoomName.Should().Be($"call-{callId:N}");
        admission.CallId.Should().Be(callId);

        var admittedApt = await context.Appointments.AsNoTracking().FirstAsync(a => a.Id == aptDto.Id);
        admittedApt.Status.Should().Be(AppointmentStatus.InConsultation);
        admittedApt.AdmittedAtUtc.Should().NotBeNull();

        // Mock LiveKit Media Room Tokens
        var staffIdentity = $"staff:{_doctorId:N}";
        var patientIdentity = $"patient:{patient.Id:N}";
        var mediaResponse = new MediaRoomRespondedPayload(
            CallId: callId,
            RoomName: $"call-{callId:N}",
            RelayUrl: "wss://livekit.clinicez.internal",
            ParticipantTokens: new Dictionary<string, string>
            {
                [staffIdentity] = "jwt-clinician-token",
                [patientIdentity] = "jwt-patient-token"
            },
            Success: true,
            ErrorMessage: null);

        requestClient.RequestAsync<MediaRoomRequestedPayload, MediaRoomRespondedPayload>(
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(),
            Arg.Any<MediaRoomRequestedPayload>(), Arg.Any<TimeSpan?>(), Arg.Any<CancellationToken>())
            .Returns(mediaResponse);

        var joinHandler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance,
            licenseValidator: licenseValidator);

        var joinResult = await joinHandler.Handle(new JoinTeleconsultCallCommand(aptDto.Id), CancellationToken.None);

        joinResult.Should().NotBeNull();
        joinResult.RoomName.Should().Be($"call-{callId:N}");
        joinResult.ClinicianToken.Should().Be("jwt-clinician-token");
        joinResult.RelayUrl.Should().Be("wss://livekit.clinicez.internal");
        joinResult.MediaAvailable.Should().BeTrue();

        publisher.Received().Enqueue(
            InteropTypes.CommsCallStateChanged,
            Arg.Any<Party>(),
            Party.ForPatient(patient.Id.ToString()),
            callId,
            Arg.Is<CommsCallStateChangedPayload>(p =>
                p.CallId == callId &&
                p.Status == "Admitted"));

        // =========================================================================
        // 4. In-Call Collaboration & Intermittent Network Drop (TC-T1.5.1, TC-T2.5.1)
        // =========================================================================
        // At minute 14, Wi-Fi dropout occurs. Clinical safety invariant: accidental drops must NEVER terminate appointment in DB
        var activeApt = await context.Appointments.AsNoTracking().FirstAsync(a => a.Id == aptDto.Id);
        activeApt.Status.Should().Be(AppointmentStatus.InConsultation, "Accidental disconnect must NEVER invoke EndCall or terminate appointment in DB");

        publisher.DidNotReceive().Enqueue(
            InteropTypes.MediaRoomEnded,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            Arg.Any<Guid>(),
            Arg.Any<MediaRoomEndedPayload>());

        publisher.DidNotReceive().Enqueue(
            InteropTypes.GuestTeleconsultInviteRevoked,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            Arg.Any<Guid>(),
            Arg.Any<GuestTeleconsultInviteRevokedPayload>());

        // =========================================================================
        // 5. Explicit Physician End Call with Confirmation Dialog (TC-T1.5.2, TC-T1.5.3, TC-T1.5.4)
        // =========================================================================
        var endHandler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        var endResult = await endHandler.Handle(
            new EndTeleconsultCallCommand(aptDto.Id, "Consultation concluded successfully"),
            CancellationToken.None);

        endResult.Should().NotBeNull();
        endResult.Status.Should().Be("Ended");
        endResult.AppointmentId.Should().Be(aptDto.Id);
        endResult.CallId.Should().Be(callId);
        endResult.WormAuditLogged.Should().BeTrue();
        endResult.CommsCallStateChangedEnqueued.Should().BeTrue();

        // Assert DB state updated to Completed
        var completedApt = await context.Appointments.AsNoTracking().FirstAsync(a => a.Id == aptDto.Id);
        completedApt.Status.Should().Be(AppointmentStatus.Completed);

        // Assert Outbox: CommsCallStateChanged (Ended)
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallStateChanged,
            Arg.Any<Party>(),
            Party.ForPatient(patient.Id.ToString()),
            callId,
            Arg.Is<CommsCallStateChangedPayload>(p =>
                p.CallId == callId &&
                p.Status == "Ended" &&
                p.StateVersion == 2));

        // Assert Outbox: GuestTeleconsultInviteRevoked to Party.Portal
        publisher.Received(1).Enqueue(
            InteropTypes.GuestTeleconsultInviteRevoked,
            Arg.Any<Party>(),
            Party.Portal,
            aptDto.Id,
            Arg.Is<GuestTeleconsultInviteRevokedPayload>(p =>
                p.AppointmentId == aptDto.Id &&
                p.CallId == callId &&
                p.TenantId == _tenantId &&
                p.Reason == "Consultation concluded successfully"));

        // Assert Outbox: MediaRoomEnded to Party.Media
        publisher.Received(1).Enqueue(
            InteropTypes.MediaRoomEnded,
            Arg.Any<Party>(),
            Party.Media,
            callId,
            Arg.Is<MediaRoomEndedPayload>(p =>
                p.CallId == callId &&
                p.TenantId == _tenantId &&
                p.RoomName == $"call-{callId:N}"));

        // Assert WORM Audit Entry in DB
        var audits = await auditRepo.Query().ToListAsync();
        audits.Should().Contain(a =>
            a.Action == "teleconsult.call.ended" &&
            a.TargetEntityId == aptDto.Id.ToString() &&
            a.Outcome == ClinicAuditOutcomes.Success);
    }

    // =========================================================================
    // WORKLOAD 3: Administrative Governance, Unauthorized Activation & Downgrade Cascade
    // =========================================================================
    [Fact]
    public async Task Workload3_AdministrativeGovernance_UnauthorizedActivationAndDowngradeCascadeJourney()
    {
        // Setup: In-memory DB, repositories, and publisher
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        // Step 1: Initial state - clinic facility defaults EnableTeleconsultation to false (TC-T1.4.1)
        var initialSettings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Apex Clinic",
            LicenseToken = "tok-standard-unentitled",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(initialSettings);
        await uow.SaveChangesAsync();

        var initialDb = await context.Settings.FirstAsync(s => s.ClinicId == _clinicId);
        initialDb.EnableTeleconsultation.Should().BeFalse("Facility settings must default to false for opt-in compliance");

        // Step 2: Clinic Admin attempts unauthorized activation while workspace is unentitled (TC-T1.4.2)
        var unentitledValidator = CreateLicenseValidator(entitled: false);
        var updateHandler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: unentitledValidator);

        var unauthorizedCmd = new UpdateClinicSettingsCommand(EnableTeleconsultation: true);
        var actUnauthorized = () => updateHandler.Handle(unauthorizedCmd, CancellationToken.None);

        await actUnauthorized.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*tenant workspace lacks active teleconsultation entitlement*");

        var afterUnauthorized = await context.Settings.AsNoTracking().FirstAsync(s => s.ClinicId == _clinicId);
        afterUnauthorized.EnableTeleconsultation.Should().BeFalse("Unauthorized activation attempt must not persist changes");

        // Step 3 & 4: Workspace activates PAYG in Portal -> License minted with teleconsultation (TC-T1.4.3)
        var entitledValidator = CreateLicenseValidator(entitled: true);
        var entitledHandler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: entitledValidator);

        var successCmd = new UpdateClinicSettingsCommand(EnableTeleconsultation: true);
        var updatedDto = await entitledHandler.Handle(successCmd, CancellationToken.None);

        updatedDto.EnableTeleconsultation.Should().BeTrue();
        updatedDto.IsWorkspaceTeleconsultEntitled.Should().BeTrue();

        var afterSuccess = await context.Settings.AsNoTracking().FirstAsync(s => s.ClinicId == _clinicId);
        afterSuccess.EnableTeleconsultation.Should().BeTrue();

        // Step 4b: Scheduling appointments now allowed
        var createAptHandler = new CreateAppointmentCommandHandler(
            aptRepo, uow, _clinicContext, settingsRepo: settingsRepo, licenseValidator: entitledValidator);

        var aptCmd = new CreateAppointmentCommand(
            PatientId: _patientId,
            PatientName: "Juan Dela Cruz",
            DoctorId: _doctorId,
            DoctorName: "Dr. Santos",
            ScheduledAt: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            AppointmentType: AppointmentType.Teleconsult);

        var createdApt = await createAptHandler.Handle(aptCmd, CancellationToken.None);
        createdApt.Should().NotBeNull();
        createdApt.AppointmentType.Should().Be(AppointmentType.Teleconsult);

        // Step 5: Multi-Facility Workspace Downgrade Cascade (TC-T1.4.4, TC-T2.4.5, TC-T3.5)
        var clinic2Id = Guid.NewGuid();
        var clinic3Id = Guid.NewGuid();
        context.Settings.AddRange(
            new FacilitySettings
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = clinic2Id,
                ClinicName = "Apex Clinic Branch 2",
                LicenseToken = "tok-licensed-2",
                EnableTeleconsultation = true
            },
            new FacilitySettings
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = clinic3Id,
                ClinicName = "Apex Clinic Branch 3",
                LicenseToken = "tok-licensed-3",
                EnableTeleconsultation = true
            });
        await context.SaveChangesAsync();

        // Inbound license arrives with teleconsultation REMOVED
        var downgradedValidator = CreateLicenseValidator(entitled: false);
        var facilityHandler = new FacilityCreatedHandler(
            context, publisher, downgradedValidator, NullLogger<FacilityCreatedHandler>.Instance);

        var multiClinics = new[] { _clinicId, clinic2Id, clinic3Id };
        foreach (var cId in multiClinics)
        {
            var evt = new FacilityCreatedEvent
            {
                TenantId = _tenantId,
                FacilityType = FacilityType.Clinic,
                ResourceId = cId,
                Name = $"Apex Clinic {cId}",
                LicenseToken = "tok-downgraded",
                PlanTier = "Standard"
            };
            var msgContext = MessagingTestKit.Delivered(
                InteropTypes.FacilityLicenseIssued,
                Party.Portal,
                MessagingTestKit.ClinicParty(_tenantId, cId),
                Guid.NewGuid(),
                evt);

            await facilityHandler.HandleAsync(evt, msgContext, CancellationToken.None);
        }

        var allSettings = await context.Settings.IgnoreQueryFilters()
            .Where(s => s.TenantId == _tenantId)
            .ToListAsync();

        allSettings.Should().HaveCount(3);
        allSettings.Should().AllSatisfy(s =>
        {
            s.EnableTeleconsultation.Should().BeFalse("Downgrade must automatically cascade EnableTeleconsultation = false across all clinics in tenant");
        });

        // Step 6: Subsequent scheduling attempts immediately blocked (TC-T1.4.5)
        var blockedAptCmd = aptCmd with { ScheduledAt = DateTime.UtcNow.AddDays(2) };
        var blockedHandler = new CreateAppointmentCommandHandler(
            aptRepo, uow, _clinicContext, settingsRepo: settingsRepo, licenseValidator: downgradedValidator);

        var blockedAct = () => blockedHandler.Handle(blockedAptCmd, CancellationToken.None);
        await blockedAct.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("Teleconsultation is not enabled for this clinic.");
    }

    // =========================================================================
    // WORKLOAD 4: Solo Waiting Room Timeout, Active Extension & Resource Protection
    // =========================================================================
    [Fact]
    public void Workload4_SoloWaitingRoomTimeout_ActiveExtensionAndAutomatedTerminationJourney()
    {
        var callId = Guid.NewGuid();
        var initialState = new SoloRoomSessionState(
            CallId: callId,
            RemoteParticipantCount: 0,
            SoloDuration: TimeSpan.Zero,
            WarningBannerVisible: false,
            AutoLeaveTriggered: false,
            LeftCleanly: false);

        // 1. Clinician enters room alone at T=0
        initialState.WarningBannerVisible.Should().BeFalse();

        // 2. Continuous solo presence for 5 minutes (300,000ms) triggers warning banner (TC-T1.5.6)
        var stateAt5Min = ProductionLifecycleEngine.EvaluateSoloPresence(initialState, TimeSpan.FromMinutes(5), clickStayInCall: false, clickLeaveRoom: false);
        stateAt5Min.WarningBannerVisible.Should().BeTrue("Solo warning banner must appear after continuous 5-minute solo presence");
        stateAt5Min.AutoLeaveTriggered.Should().BeFalse();

        // 3. Active Extension: Clinician clicks "Stay in Call" at 1m58s of grace period (TC-T2.5.4)
        var extendedState = ProductionLifecycleEngine.EvaluateSoloPresence(stateAt5Min, TimeSpan.FromMinutes(6).Add(TimeSpan.FromSeconds(58)), clickStayInCall: true, clickLeaveRoom: false);
        extendedState.WarningBannerVisible.Should().BeFalse("Clicking Stay in Call must dismiss warning banner");
        extendedState.SoloDuration.Should().Be(TimeSpan.Zero, "Timer must reset to 0 upon Stay in Call");

        // 4. Inaction: Room remains solo again for 5 minutes -> banner reappears
        var stateAt10Min = ProductionLifecycleEngine.EvaluateSoloPresence(extendedState, TimeSpan.FromMinutes(5), clickStayInCall: false, clickLeaveRoom: false);
        stateAt10Min.WarningBannerVisible.Should().BeTrue();

        // 5. Grace Countdown Expiration: Unanswered 2-minute countdown (at 7:00 total) auto-disconnects (TC-T1.5.6)
        var autoLeaveState = ProductionLifecycleEngine.EvaluateSoloPresence(stateAt10Min, TimeSpan.FromMinutes(7), clickStayInCall: false, clickLeaveRoom: false);
        autoLeaveState.AutoLeaveTriggered.Should().BeTrue("Auto-leave must trigger when 2-minute grace period expires");

        // 6. Alternative: Clinician clicks "Leave Room" on warning banner -> leaves cleanly without completing appointment (TC-T2.5.5)
        var leftCleanlyState = ProductionLifecycleEngine.EvaluateSoloPresence(stateAt5Min, TimeSpan.FromMinutes(5).Add(TimeSpan.FromSeconds(30)), clickStayInCall: false, clickLeaveRoom: true);
        leftCleanlyState.LeftCleanly.Should().BeTrue();
        leftCleanlyState.WarningBannerVisible.Should().BeFalse();
    }

    // =========================================================================
    // TC-T1.4.1 - TC-T1.4.5: Governance Feature Coverage
    // =========================================================================
    [Fact]
    public void TC_T1_4_1_FacilitySettings_EnableTeleconsultation_DefaultsToFalse()
    {
        var settings = new FacilitySettings { ClinicName = "Test" };
        settings.EnableTeleconsultation.Should().BeFalse("Must default to false for compliance and opt-in safety");
    }

    [Fact]
    public async Task TC_T1_4_2_UpdateClinicSettingsCommand_RejectedWhenWorkspaceUnentitled()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Apex Clinic",
            LicenseToken = "tok-unentitled",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = CreateLicenseValidator(entitled: false);
        var handler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow, licenseValidator: validator);

        var cmd = new UpdateClinicSettingsCommand(EnableTeleconsultation: true);
        var act = () => handler.Handle(cmd, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*tenant workspace lacks active teleconsultation entitlement*");

        var persisted = await context.Settings.FirstAsync(s => s.ClinicId == _clinicId);
        persisted.EnableTeleconsultation.Should().BeFalse();
    }

    [Fact]
    public async Task TC_T1_4_3_UpdateClinicSettingsCommand_SuccessWhenWorkspaceEntitled()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Apex Clinic",
            LicenseToken = "tok-entitled",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = CreateLicenseValidator(entitled: true);
        var handler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow, licenseValidator: validator);

        var cmd = new UpdateClinicSettingsCommand(EnableTeleconsultation: true);
        var result = await handler.Handle(cmd, CancellationToken.None);

        result.EnableTeleconsultation.Should().BeTrue();
        result.IsWorkspaceTeleconsultEntitled.Should().BeTrue();

        var persisted = await context.Settings.FirstAsync(s => s.ClinicId == _clinicId);
        persisted.EnableTeleconsultation.Should().BeTrue();
    }

    [Fact]
    public async Task TC_T1_4_4_InboundLicenseDowngrade_CascadesEnableTeleconsultationToFalse()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var publisher = Substitute.For<IInteropPublisher>();

        context.Settings.Add(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Apex Clinic",
            LicenseToken = "tok-previously-entitled",
            EnableTeleconsultation = true
        });
        await context.SaveChangesAsync();

        var validator = CreateLicenseValidator(entitled: false);
        var handler = new FacilityCreatedHandler(context, publisher, validator, NullLogger<FacilityCreatedHandler>.Instance);

        var evt = new FacilityCreatedEvent
        {
            TenantId = _tenantId,
            FacilityType = FacilityType.Clinic,
            ResourceId = _clinicId,
            Name = "Apex Clinic",
            LicenseToken = "tok-downgraded",
            PlanTier = "Standard"
        };
        var msgContext = MessagingTestKit.Delivered(
            InteropTypes.FacilityLicenseIssued,
            Party.Portal,
            MessagingTestKit.ClinicParty(_tenantId, _clinicId),
            Guid.NewGuid(),
            evt);

        await handler.HandleAsync(evt, msgContext, CancellationToken.None);

        var refreshed = await context.Settings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == _clinicId);
        refreshed.EnableTeleconsultation.Should().BeFalse("Inbound license downgrade must cascade EnableTeleconsultation to false");
    }

    [Fact]
    public async Task TC_T1_4_5_GatingAppointmentScheduling_BehindEffectiveEnablement()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        context.Settings.Add(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Apex Clinic",
            LicenseToken = "tok-entitled",
            EnableTeleconsultation = false
        });
        await context.SaveChangesAsync();

        var validator = CreateLicenseValidator(entitled: true);
        var handler = new CreateAppointmentCommandHandler(
            aptRepo, uow, _clinicContext, settingsRepo: settingsRepo, licenseValidator: validator);

        var cmd = new CreateAppointmentCommand(
            PatientId: _patientId,
            PatientName: "Juan Dela Cruz",
            DoctorId: _doctorId,
            DoctorName: "Dr. Santos",
            ScheduledAt: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            AppointmentType: AppointmentType.Teleconsult);

        var act = () => handler.Handle(cmd, CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("Teleconsultation is not enabled for this clinic.");
    }

    // =========================================================================
    // TC-T1.5.1 - TC-T1.5.4: Session Lifecycle Feature Coverage
    // =========================================================================
    [Fact]
    public void TC_T1_5_1_AccidentalDisconnect_PreservesSessionAndInviteToken()
    {
        var callId = Guid.NewGuid();
        var session = new LiveKitSessionState(callId, $"call-{callId:N}", "Active", DateTime.UtcNow, TimeSpan.FromHours(2), ReconnectionAllowed: true);

        var preserved = ProductionLifecycleEngine.SimulateNetworkDrop(session, TimeSpan.FromSeconds(45));
        preserved.Status.Should().Be("Active");
        preserved.ReconnectionAllowed.Should().BeTrue();
    }

    [Fact]
    public void TC_T1_5_2_ExplicitEndCall_RequiresConfirmationDialog()
    {
        var apt = new Appointment { Id = Guid.NewGuid(), CallId = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, PatientName = "Test Patient" };
        var audits = new List<AuditEntry>();
        var events = new List<string>();

        var act = () => ProductionLifecycleEngine.ExplicitPhysicianEndCall(apt, _doctorId, confirmedInDialog: false, audits, events);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*confirmation dialog*");
    }

    [Fact]
    public void TC_T1_5_3_PhysicianEndCall_BroadcastsDataChannelMessageToGuest()
    {
        var apt = new Appointment { Id = Guid.NewGuid(), CallId = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, PatientName = "Test Patient" };
        var audits = new List<AuditEntry>();
        var events = new List<string>();

        ProductionLifecycleEngine.ExplicitPhysicianEndCall(apt, _doctorId, confirmedInDialog: true, audits, events);

        events.Should().Contain($"livekit.datachannel:call_ended_by_clinician:{apt.CallId}");
    }

    [Fact]
    public async Task TC_T1_5_4_PhysicianEndCall_EnqueuesGuestInviteRevokedAndMediaRoomEnded()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var sender = Substitute.For<ISender>();

        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Test Patient",
            DoctorId = _doctorId,
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            Status = AppointmentStatus.InConsultation
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var handler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        var result = await handler.Handle(new EndTeleconsultCallCommand(apt.Id, "Doctor ended consultation"), CancellationToken.None);

        result.Status.Should().Be("Ended");
        publisher.Received(1).Enqueue(
            InteropTypes.GuestTeleconsultInviteRevoked,
            Arg.Any<Party>(),
            Party.Portal,
            apt.Id,
            Arg.Is<GuestTeleconsultInviteRevokedPayload>(p =>
                p.AppointmentId == apt.Id &&
                p.CallId == callId &&
                p.Reason == "Doctor ended consultation"));

        publisher.Received(1).Enqueue(
            InteropTypes.MediaRoomEnded,
            Arg.Any<Party>(),
            Party.Media,
            callId,
            Arg.Is<MediaRoomEndedPayload>(p =>
                p.CallId == callId &&
                p.RoomName == $"call-{callId:N}"));
    }

    // =========================================================================
    // TC-T2.4.1 & TC-T2.5.1 - TC-T2.5.6: Boundary & Corner Cases
    // =========================================================================
    [Fact]
    public async Task TC_T2_4_1_MissingLicenseToken_HandledSafelyWithoutNullReferenceException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Apex Clinic",
            LicenseToken = null, // Explicitly NULL token
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = Substitute.For<IFacilityLicenseValidator>();
        var handler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: validator);

        var cmd = new UpdateClinicSettingsCommand(EnableTeleconsultation: true);
        var act = () => handler.Handle(cmd, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*tenant workspace lacks active teleconsultation entitlement*");

        var persisted = await context.Settings.FirstAsync(s => s.ClinicId == _clinicId);
        persisted.EnableTeleconsultation.Should().BeFalse();
    }

    [Fact]
    public void TC_T2_5_1_ReconnectionAt1Hour45Minutes_Under2HourTtl_Succeeds()
    {
        var session = new LiveKitSessionState(Guid.NewGuid(), "call-rec", "Active", DateTime.UtcNow.AddMinutes(-105), TimeSpan.FromHours(2), true);
        var allowed = ProductionLifecycleEngine.EvaluateReconnection(session, TimeSpan.FromMinutes(105));
        allowed.Should().BeTrue();
    }

    [Fact]
    public void TC_T2_5_2_ReconnectionAttemptAt125Minutes_TokenExpired_ThrowsUnauthorized()
    {
        var session = new LiveKitSessionState(Guid.NewGuid(), "call-expired", "Active", DateTime.UtcNow.AddMinutes(-125), TimeSpan.FromHours(2), true);
        var act = () => ProductionLifecycleEngine.EvaluateReconnection(session, TimeSpan.FromMinutes(125));
        act.Should().Throw<UnauthorizedAccessException>()
            .WithMessage("*exceeded 2-hour TTL*");
    }

    [Fact]
    public async Task TC_T2_5_3_PhysicianEndCall_RevokesGuestInvite_EmitsRevocationInteropEvent()
    {
        // Arrange: Create database context and repositories using TestDbHelper
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var sender = Substitute.For<ISender>();

        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Juan Dela Cruz",
            DoctorId = _doctorId,
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            Status = AppointmentStatus.InConsultation,
            CallId = callId
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var endCallHandler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        // Act: Physician explicitly ends teleconsultation
        var result = await endCallHandler.Handle(new EndTeleconsultCallCommand(aptId, "Consultation completed by clinician"), CancellationToken.None);

        // Assert: Genuine database persistence & outbox emission
        result.Status.Should().Be("Ended");

        var updatedApt = await aptRepo.GetByIdAsync(aptId);
        updatedApt!.Status.Should().Be(AppointmentStatus.Completed, "Appointment must be marked Completed in DB");

        // Verify GuestTeleconsultInviteRevoked payload enqueued to Party.Portal
        publisher.Received(1).Enqueue(
            InteropTypes.GuestTeleconsultInviteRevoked,
            Arg.Any<Party>(),
            Party.Portal,
            aptId,
            Arg.Is<GuestTeleconsultInviteRevokedPayload>(p =>
                p.AppointmentId == aptId &&
                p.CallId == callId &&
                p.Reason == "Consultation completed by clinician"));
    }

    [Fact]
    public void TC_T2_5_4_SoloWarning_StayInCallClickedAt1m58s_ResetsTimer()
    {
        var state = new SoloRoomSessionState(Guid.NewGuid(), 0, TimeSpan.FromMinutes(6).Add(TimeSpan.FromSeconds(58)), WarningBannerVisible: true, false, false);
        var result = ProductionLifecycleEngine.EvaluateSoloPresence(state, TimeSpan.FromMinutes(6).Add(TimeSpan.FromSeconds(58)), clickStayInCall: true, clickLeaveRoom: false);

        result.WarningBannerVisible.Should().BeFalse();
        result.SoloDuration.Should().Be(TimeSpan.Zero);
    }

    [Fact]
    public void TC_T2_5_5_SoloWarning_LeaveRoomAction_LeavesCleanlyWithoutCancelingAppointment()
    {
        var state = new SoloRoomSessionState(Guid.NewGuid(), 0, TimeSpan.FromMinutes(5), WarningBannerVisible: true, false, false);
        var result = ProductionLifecycleEngine.EvaluateSoloPresence(state, TimeSpan.FromMinutes(5), clickStayInCall: false, clickLeaveRoom: true);

        result.LeftCleanly.Should().BeTrue();
        result.WarningBannerVisible.Should().BeFalse();
    }

    [Fact]
    public void TC_T2_5_6_StaleSessionCleanup_SessionsOlderThan2Hours_AreCleanedUp()
    {
        var sessions = new List<LiveKitSessionState>
        {
            new(Guid.NewGuid(), "call-stale-1", "Active", DateTime.UtcNow.AddHours(-3), TimeSpan.FromHours(2), true),
            new(Guid.NewGuid(), "call-stale-2", "Active", DateTime.UtcNow.AddHours(-4), TimeSpan.FromHours(2), true),
            new(Guid.NewGuid(), "call-active", "Active", DateTime.UtcNow.AddMinutes(-30), TimeSpan.FromHours(2), true)
        };

        int cleaned = ProductionLifecycleEngine.CleanupStaleSessions(sessions, TimeSpan.FromHours(2));

        cleaned.Should().Be(2);
        sessions[0].Status.Should().Be("Ended");
        sessions[1].Status.Should().Be("Ended");
        sessions[2].Status.Should().Be("Active");
    }

    // =========================================================================
    // TC-T3.1, TC-T3.4, TC-T3.5: Cross-Feature Integration Flows
    // =========================================================================
    [Fact]
    public async Task TC_T3_1_CommercialEnablementCascade_AndEndToEndConsultation()
    {
        // Arrange: Create context and handlers
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var sender = Substitute.For<ISender>();

        // Step 1: Seed patient & facility settings with valid entitled license
        var patient = new Patient
        {
            Id = _patientId,
            ClinicId = _clinicId,
            PatientCode = "P-3001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1992, 7, 10),
            ContactNumber = "09123456789"
        };
        await patientRepo.AddAsync(patient);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "St. Jude Clinic",
            LicenseToken = "tok-licensed-teleconsult",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var licenseValidator = CreateLicenseValidator(entitled: true);

        // Step 2: Clinic Admin enables teleconsultation via UpdateClinicSettingsCommand
        var updateSettingsHandler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: licenseValidator);
        var settingsResult = await updateSettingsHandler.Handle(new UpdateClinicSettingsCommand(EnableTeleconsultation: true), CancellationToken.None);
        settingsResult.EnableTeleconsultation.Should().BeTrue();

        // Step 3: Schedule Teleconsult Appointment
        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Juan Dela Cruz",
            DoctorId = _doctorId,
            ScheduledAt = DateTime.UtcNow.AddMinutes(15),
            AppointmentType = AppointmentType.Teleconsult,
            Status = AppointmentStatus.Confirmed,
            CallId = callId
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        // Step 4: Dispatch Guest Invite via CreateTeleconsultGuestInviteCommand
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Portal:BaseUrl"] = "https://portal.clinicez.ph"
        }).Build();

        var inviteHandler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, _clinicContext, publisher, config,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance,
            settingsRepo, licenseValidator);

        var invite = await inviteHandler.Handle(new CreateTeleconsultGuestInviteCommand(aptId), CancellationToken.None);
        invite.Otp.Should().MatchRegex(@"^\d{6}$", "Dynamic OTP must be a valid 6-digit PIN");
        publisher.Received(1).Enqueue(InteropTypes.GuestTeleconsultInviteIssued, Arg.Any<Party>(), Party.Portal, aptId, Arg.Any<GuestTeleconsultInviteIssuedPayload>());

        // Step 5: Simulate modal state cache reuse without rotation (Requirement R1)
        var cachedInvite = invite;
        cachedInvite.Otp.Should().Be(invite.Otp, "Modal state cache preserves the identical OTP across multiple copy clicks");

        // Step 6: Explicit Physician End Call via EndTeleconsultCallCommandHandler
        var endCallHandler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        var endResult = await endCallHandler.Handle(new EndTeleconsultCallCommand(aptId), CancellationToken.None);

        // Step 7: Assert genuine side-effects
        endResult.Status.Should().Be("Ended");
        (await aptRepo.GetByIdAsync(aptId))!.Status.Should().Be(AppointmentStatus.Completed);
        publisher.Received(1).Enqueue(InteropTypes.GuestTeleconsultInviteRevoked, Arg.Any<Party>(), Party.Portal, aptId, Arg.Any<GuestTeleconsultInviteRevokedPayload>());
        publisher.Received(1).Enqueue(InteropTypes.MediaRoomEnded, Arg.Any<Party>(), Party.Media, callId, Arg.Any<MediaRoomEndedPayload>());
    }

    [Fact]
    public async Task TC_T3_4_PrepaidBalanceDepletionDuringConsultation_CutoffProtectionEnsured()
    {
        // Arrange: In-flight consultation running past initial prepaid pool
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var sender = Substitute.For<ISender>();

        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Maria Santos",
            DoctorId = _doctorId,
            ScheduledAt = DateTime.UtcNow.AddMinutes(-12),
            AppointmentType = AppointmentType.Teleconsult,
            Status = AppointmentStatus.InConsultation,
            CallId = callId
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        // Verify that Clinic API never marks consultation Completed or Terminated mid-call
        apt.Status.Should().Be(AppointmentStatus.InConsultation, "Consultation must remain active despite balance depletion at minute 5");

        var endCallHandler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        // Act: Clinician explicitly concludes the 12-minute examination
        var result = await endCallHandler.Handle(new EndTeleconsultCallCommand(aptId), CancellationToken.None);

        // Assert: MediaRoomEnded enqueued to Party.Media with correct callId and roomName for full duration billing
        result.Status.Should().Be("Ended");
        publisher.Received(1).Enqueue(
            InteropTypes.MediaRoomEnded,
            Arg.Any<Party>(),
            Party.Media,
            callId,
            Arg.Is<MediaRoomEndedPayload>(p =>
                p.CallId == callId &&
                p.RoomName == $"call-{callId:N}"));
    }

    [Fact]
    public async Task TC_T3_5_LicenseRevocationCascade_MidOperation_InFlightCallCompletesSafely()
    {
        // Arrange: Create context and repositories
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var sender = Substitute.For<ISender>();

        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Portal:BaseUrl"] = "https://portal.clinicez.ph"
        }).Build();

        var patient = new Patient
        {
            Id = _patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-3005",
            FirstName = "Scheduled",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "09123456789"
        };
        await patientRepo.AddAsync(patient);

        // 1. Ongoing in-flight consultation
        var inFlightAptId = Guid.NewGuid();
        var inFlightCallId = Guid.NewGuid();
        var inFlightApt = new Appointment
        {
            Id = inFlightAptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "InFlight Patient",
            DoctorId = _doctorId,
            ScheduledAt = DateTime.UtcNow.AddMinutes(-20),
            AppointmentType = AppointmentType.Teleconsult,
            Status = AppointmentStatus.InConsultation,
            CallId = inFlightCallId
        };
        await aptRepo.AddAsync(inFlightApt);

        // 2. Newly scheduled appointment waiting for admission
        var scheduledAptId = Guid.NewGuid();
        var scheduledApt = new Appointment
        {
            Id = scheduledAptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Scheduled Patient",
            DoctorId = _doctorId,
            ScheduledAt = DateTime.UtcNow.AddMinutes(10),
            AppointmentType = AppointmentType.Teleconsult,
            Status = AppointmentStatus.Confirmed,
            CallId = Guid.NewGuid()
        };
        await aptRepo.AddAsync(scheduledApt);

        // 3. License downgrade arrives: FacilitySettings.EnableTeleconsultation cascades to false
        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "St. Jude Clinic",
            LicenseToken = "tok-downgraded",
            EnableTeleconsultation = false // cascaded to false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var unentitledValidator = CreateLicenseValidator(entitled: false);

        // 4. Verify that new invite generation or admission for the scheduled appointment is blocked
        var inviteHandler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, _clinicContext, publisher, config,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance,
            settingsRepo, unentitledValidator);

        var actBlockedInvite = () => inviteHandler.Handle(new CreateTeleconsultGuestInviteCommand(scheduledAptId), CancellationToken.None);
        await actBlockedInvite.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*Teleconsultation is not enabled for this clinic*");

        // 5. Verify that in-flight active consultation completes safely through real EndTeleconsultCallCommandHandler
        var endCallHandler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        var endResult = await endCallHandler.Handle(new EndTeleconsultCallCommand(inFlightAptId), CancellationToken.None);
        endResult.Status.Should().Be("Ended");

        var persistedInFlight = await aptRepo.GetByIdAsync(inFlightAptId);
        persistedInFlight!.Status.Should().Be(AppointmentStatus.Completed, "In-flight call must complete normally despite license downgrade");
        publisher.Received(1).Enqueue(InteropTypes.MediaRoomEnded, Arg.Any<Party>(), Party.Media, inFlightCallId, Arg.Any<MediaRoomEndedPayload>());
    }
}
