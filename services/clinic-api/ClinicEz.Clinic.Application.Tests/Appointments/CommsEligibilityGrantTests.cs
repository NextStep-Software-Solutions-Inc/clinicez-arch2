using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Appointments;

public sealed class CommsEligibilityGrantTests
{
    private const string TenantId = "tenant-nextstep-opd";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;

    public CommsEligibilityGrantTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(TenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
        _clinicContext.StaffName.Returns("Front Desk Staff");
    }

    private static Patient CreatePatient(Guid clinicId, Guid? cloudPatientId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        ClinicId = clinicId,
        CloudPatientId = cloudPatientId,
        PatientCode = $"PAT-2026-{Random.Shared.Next(10000, 99999)}",
        FirstName = "Justine Mae",
        LastName = "Tabasan",
        DateOfBirth = new DateOnly(1995, 5, 14),
        Sex = BiologicalSex.Female,
        ContactNumber = "09171234567"
    };

    private static List<T> ReadOutboxPayloads<T>(ApplicationDbContext db, string interopType)
    {
        return db.InteropOutbox
            .Where(o => o.Type == interopType)
            .AsEnumerable()
            .Select(o => JsonSerializer.Deserialize<InteropEnvelope>(o.EnvelopeJson, InteropJson.Options)!)
            .Select(e => e.Payload.Deserialize<T>(InteropJson.Options)!)
            .ToList();
    }

    [Fact]
    public async Task CreateRescheduleCancelAppointment_UsesCloudPatientId_AndMonotonicVersions()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        MessagingTestKit.SeedClinic(db, _clinicId, TenantId, "Nextstep OPD");

        var apptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var publisher = new InteropPublisher(db);
        var eligibilityPublisher = new CommsEligibilityPublisher(db, publisher, NullLogger<CommsEligibilityPublisher>.Instance);

        var cloudPatientId = Guid.NewGuid();
        var patient = CreatePatient(_clinicId, cloudPatientId);
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var createHandler = new CreateAppointmentCommandHandler(
            apptRepo, uow, _clinicContext, publisher: publisher, patientRepo: patientRepo, eligibilityPublisher: eligibilityPublisher);
        var created = await createHandler.Handle(
            new CreateAppointmentCommand(
                patient.Id,
                "Justine Mae Tabasan",
                null,
                null,
                DateTime.UtcNow.AddHours(3)),
            CancellationToken.None);

        var grantsAfterCreate = ReadOutboxPayloads<CommsEligibilityGrantedPayload>(db, InteropTypes.CommsEligibilityGranted);
        grantsAfterCreate.Should().ContainSingle();
        grantsAfterCreate[0].PatientId.Should().Be(cloudPatientId);
        grantsAfterCreate[0].PatientId.Should().NotBe(patient.Id);
        grantsAfterCreate[0].ContextType.Should().Be("Appointment");
        grantsAfterCreate[0].ContextId.Should().Be(created.Id.ToString());
        grantsAfterCreate[0].Version.Should().Be(CommsEligibilityVersions.Initial);

        var rescheduleHandler = new RescheduleAppointmentCommandHandler(
            apptRepo, uow, publisher: publisher, patientRepo: patientRepo, eligibilityPublisher: eligibilityPublisher);
        await rescheduleHandler.Handle(
            new RescheduleAppointmentCommand(created.Id, DateTime.UtcNow.AddDays(1)),
            CancellationToken.None);

        var grantsAfterReschedule = ReadOutboxPayloads<CommsEligibilityGrantedPayload>(db, InteropTypes.CommsEligibilityGranted);
        grantsAfterReschedule.Should().HaveCount(2);
        grantsAfterReschedule[1].PatientId.Should().Be(cloudPatientId);
        grantsAfterReschedule[1].Version.Should().BeGreaterThan(grantsAfterCreate[0].Version);

        var cancelHandler = new CancelAppointmentCommandHandler(
            apptRepo, uow, publisher: publisher, patientRepo: patientRepo, eligibilityPublisher: eligibilityPublisher);
        await cancelHandler.Handle(
            new CancelAppointmentCommand(created.Id, "Patient requested cancel"),
            CancellationToken.None);

        var revocations = ReadOutboxPayloads<CommsEligibilityRevokedPayload>(db, InteropTypes.CommsEligibilityRevoked);
        revocations.Should().ContainSingle();
        revocations[0].PatientId.Should().Be(cloudPatientId);
        revocations[0].Version.Should().BeGreaterThan(grantsAfterReschedule[1].Version);
    }

    [Fact]
    public async Task CreateAppointment_WalkInWithoutCloudPatientId_DoesNotEmitInvalidGrant()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        MessagingTestKit.SeedClinic(db, _clinicId, TenantId, "Nextstep OPD");

        var apptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var publisher = new InteropPublisher(db);
        var eligibilityPublisher = new CommsEligibilityPublisher(db, publisher, NullLogger<CommsEligibilityPublisher>.Instance);

        var walkIn = CreatePatient(_clinicId, cloudPatientId: null);
        await patientRepo.AddAsync(walkIn);
        await uow.SaveChangesAsync();

        var createHandler = new CreateAppointmentCommandHandler(
            apptRepo, uow, _clinicContext, publisher: publisher, patientRepo: patientRepo, eligibilityPublisher: eligibilityPublisher);
        await createHandler.Handle(
            new CreateAppointmentCommand(walkIn.Id, "Walk In", null, null, DateTime.UtcNow.AddHours(2)),
            CancellationToken.None);

        var grants = ReadOutboxPayloads<CommsEligibilityGrantedPayload>(db, InteropTypes.CommsEligibilityGranted);
        grants.Should().BeEmpty();
    }

    [Fact]
    public async Task CheckInPatient_WithAndWithoutAppointment_EmitsEligibilityGrantWithCloudPatientId()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        MessagingTestKit.SeedClinic(db, _clinicId, TenantId, "Nextstep OPD");

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var publisher = new InteropPublisher(db);
        var eligibilityPublisher = new CommsEligibilityPublisher(db, publisher, NullLogger<CommsEligibilityPublisher>.Instance);
        var identity = new ClinicIdentityProvider(db, _clinicContext);
        var apptPublisher = Substitute.For<IPatientAppointmentPublisher>();

        var cloudPatientId = Guid.NewGuid();
        var patient = CreatePatient(_clinicId, cloudPatientId);
        await patientRepo.AddAsync(patient);

        var appt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Justine Mae Tabasan",
            ScheduledAt = DateTime.UtcNow.AddHours(1),
            Status = AppointmentStatus.Confirmed
        };
        await apptRepo.AddAsync(appt);
        await uow.SaveChangesAsync();

        var handler = new CheckInPatientCommandHandler(
            queueRepo,
            apptRepo,
            uow,
            _clinicContext,
            identity,
            apptPublisher,
            patientRepository: patientRepo,
            eligibilityPublisher: eligibilityPublisher,
            publisher: publisher);

        var ticket = await handler.Handle(
            new CheckInPatientCommand(patient.Id, "Justine Mae Tabasan", AppointmentId: appt.Id),
            CancellationToken.None);

        var grants = ReadOutboxPayloads<CommsEligibilityGrantedPayload>(db, InteropTypes.CommsEligibilityGranted);
        grants.Should().HaveCount(2);
        grants.Should().Contain(g =>
            g.PatientId == cloudPatientId &&
            g.ContextType == "QueueVisit" &&
            g.ContextId == ticket.Id.ToString());
        grants.Should().Contain(g =>
            g.PatientId == cloudPatientId &&
            g.ContextType == "Appointment" &&
            g.ContextId == appt.Id.ToString());
    }

    [Fact]
    public async Task RegisterPatientWithSendToTriage_AndEnsureDirectVisit_EmitQueueVisitGrants()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        MessagingTestKit.SeedClinic(db, _clinicId, TenantId, "Nextstep OPD");

        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var publisher = new InteropPublisher(db);
        var eligibilityPublisher = new CommsEligibilityPublisher(db, publisher, NullLogger<CommsEligibilityPublisher>.Instance);

        var cloudPatientId1 = Guid.NewGuid();
        var regHandler = new RegisterClinicPatientCommandHandler(
            patientRepo,
            uow,
            _clinicContext,
            queueRepo: queueRepo,
            eligibilityPublisher: eligibilityPublisher);

        var registered = await regHandler.Handle(
            new RegisterClinicPatientCommand(
                FirstName: "Justine",
                LastName: "Tabasan",
                MiddleName: null,
                Suffix: null,
                DateOfBirth: new DateOnly(1995, 5, 14),
                Sex: "Female",
                CivilStatus: "Single",
                ContactNumber: "09171234567",
                Email: "justine@example.com",
                AddressLine: null,
                Barangay: null,
                City: null,
                Province: null,
                EmergencyContactName: null,
                EmergencyContactPhone: null,
                EmergencyContactRelationship: null,
                PhilHealthNumber: null,
                SeniorCitizenId: null,
                PwdId: null,
                BloodType: null,
                Allergies: null,
                ChronicConditions: null,
                Alerts: null,
                CloudPatientId: cloudPatientId1,
                SendToTriage: true),
            CancellationToken.None);

        var cloudPatientId2 = Guid.NewGuid();
        var directPatient = CreatePatient(_clinicId, cloudPatientId2);
        await patientRepo.AddAsync(directPatient);
        await uow.SaveChangesAsync();

        var directHandler = new EnsureDirectVisitCommandHandler(
            queueRepo, uow, _clinicContext, eligibilityPublisher: eligibilityPublisher);
        var dv = await directHandler.Handle(
            new EnsureDirectVisitCommand(directPatient.Id, "Direct Patient"),
            CancellationToken.None);

        var grants = ReadOutboxPayloads<CommsEligibilityGrantedPayload>(db, InteropTypes.CommsEligibilityGranted);
        grants.Should().Contain(g =>
            g.PatientId == cloudPatientId1 &&
            g.ContextType == "QueueVisit" &&
            g.ContextId == registered.ActiveQueueItemId!.Value.ToString());
        grants.Should().Contain(g =>
            g.PatientId == cloudPatientId2 &&
            g.ContextType == "QueueVisit" &&
            g.ContextId == dv.Id.ToString());
    }

    [Fact]
    public async Task AppointmentBookedHandler_NewPortalBookingAndReschedule_EmitsCommsEligibilityGranted()
    {
        using var db = MessagingTestKit.CreateDbContext();
        MessagingTestKit.SeedClinic(db, _clinicId, TenantId, "Nextstep OPD");

        var publisher = new InteropPublisher(db);
        var eligibilityPublisher = new CommsEligibilityPublisher(db, publisher, NullLogger<CommsEligibilityPublisher>.Instance);
        var handler = new AppointmentBookedHandler(
            db,
            MessagingTestKit.Recipient(db),
            publisher,
            NullLogger<AppointmentBookedHandler>.Instance,
            eligibilityPublisher);

        var cloudPatientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();
        var booked = new AppointmentBookedEvent
        {
            DraftId = draftId,
            PatientId = cloudPatientId,
            ClinicId = _clinicId,
            TenantId = TenantId,
            PreferredDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            PreferredTime = "17:00",
            Reason = "OPD Consultation",
            PatientFirstName = "Justine Mae",
            PatientLastName = "Tabasan",
            CreatedAt = DateTime.UtcNow
        };

        await handler.HandleAsync(
            booked,
            MessagingTestKit.Delivered(
                InteropTypes.PatientAppointmentBooked,
                Party.ForPatient(cloudPatientId.ToString()),
                MessagingTestKit.ClinicParty(TenantId, _clinicId),
                draftId,
                booked),
            CancellationToken.None);

        var appt = await db.Appointments.IgnoreQueryFilters().SingleAsync(a => a.DraftId == draftId);
        var grantsAfterBook = ReadOutboxPayloads<CommsEligibilityGrantedPayload>(db, InteropTypes.CommsEligibilityGranted);
        grantsAfterBook.Should().ContainSingle(g =>
            g.PatientId == cloudPatientId &&
            g.FacilityId == _clinicId.ToString() &&
            g.ContextType == "Appointment" &&
            g.ContextId == appt.Id.ToString() &&
            g.Version == CommsEligibilityVersions.Initial);

        var reschedule = booked with
        {
            RescheduledAppointmentId = appt.Id,
            PreferredDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(3)),
            PreferredTime = "10:00"
        };

        await handler.HandleAsync(
            reschedule,
            MessagingTestKit.Delivered(
                InteropTypes.PatientAppointmentBooked,
                Party.ForPatient(cloudPatientId.ToString()),
                MessagingTestKit.ClinicParty(TenantId, _clinicId),
                draftId,
                reschedule),
            CancellationToken.None);

        var grantsAfterReschedule = ReadOutboxPayloads<CommsEligibilityGrantedPayload>(db, InteropTypes.CommsEligibilityGranted);
        grantsAfterReschedule.Should().HaveCount(2);
        grantsAfterReschedule[1].Version.Should().BeGreaterThan(grantsAfterBook[0].Version);
    }

    [Fact]
    public async Task PatientShareSnapshotHandler_WhenLinkingUnlinkedPatient_SyncsExistingConfirmedAppointments()
    {
        using var db = MessagingTestKit.CreateDbContext();
        MessagingTestKit.SeedClinic(db, _clinicId, TenantId, "Nextstep OPD");

        var unlinkedPatient = CreatePatient(_clinicId, cloudPatientId: null);
        unlinkedPatient.ClinicEzId = "CE-JUSTINE-272";
        db.Patients.Add(unlinkedPatient);

        var existingAppt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = unlinkedPatient.Id,
            PatientName = "Justine Mae Tabasan",
            ScheduledAt = DateTime.UtcNow.AddHours(5),
            Status = AppointmentStatus.Confirmed
        };
        db.Appointments.Add(existingAppt);

        var importId = Guid.NewGuid();
        db.ShareImports.Add(new ShareImport
        {
            Id = importId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicEzId = unlinkedPatient.ClinicEzId,
            Status = ShareImportStatus.Pending,
            AddToQueue = false,
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var publisher = new InteropPublisher(db);
        var eligibilityPublisher = new CommsEligibilityPublisher(db, publisher, NullLogger<CommsEligibilityPublisher>.Instance);
        var handler = new PatientShareSnapshotHandler(
            db,
            MessagingTestKit.Recipient(db),
            NullLogger<PatientShareSnapshotHandler>.Instance,
            eligibilityPublisher);

        var cloudPatientId = Guid.NewGuid();
        var snapshot = new PatientShareSnapshotPayload
        {
            GrantId = Guid.NewGuid(),
            PatientId = cloudPatientId,
            ClinicEzId = unlinkedPatient.ClinicEzId,
            Granted = true,
            Scopes = SharingScopes.Demographics,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(1),
            Demographics = new ShareDemographicsDto
            {
                FirstName = "Justine Mae",
                LastName = "Tabasan",
                DateOfBirth = "1995-05-14"
            }
        };

        await handler.HandleAsync(
            snapshot,
            MessagingTestKit.Delivered(
                InteropTypes.PatientShareSnapshot,
                Party.ForPatient(cloudPatientId.ToString()),
                MessagingTestKit.ClinicParty(TenantId, _clinicId),
                importId,
                snapshot),
            CancellationToken.None);

        var grants = ReadOutboxPayloads<CommsEligibilityGrantedPayload>(db, InteropTypes.CommsEligibilityGranted);
        grants.Should().ContainSingle(g =>
            g.PatientId == cloudPatientId &&
            g.ContextType == "Appointment" &&
            g.ContextId == existingAppt.Id.ToString());
    }
}
