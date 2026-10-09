using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Records.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicOutboundMessagingTests
{
    private const string TenantId = "tenant_test";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext = Substitute.For<IClinicContext>();

    public ClinicOutboundMessagingTests()
    {
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(TenantId);
    }

    private static ClinicPatient NewPatient(Guid clinicId, Guid? syncPatientId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        ClinicId = clinicId,
        PatientCode = "PAT-2026-0001",
        FirstName = "Maria",
        LastName = "Santos",
        ContactNumber = "0917-123-4567",
        DateOfBirth = new DateOnly(1984, 3, 12),
        Gender = "Female",
        SyncPatientId = syncPatientId
    };

    // ----- clinic.record.verified -----

    [Fact]
    public async Task RecordVerified_LinkedPatient_QueuesOutboxRowInTheSameSaveAsTheVerification()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        MessagingTestKit.SeedClinic(db, _clinicId, TenantId);
        var syncId = Guid.NewGuid();
        var patient = NewPatient(_clinicId, syncId);
        db.Patients.Add(patient);
        db.RecordAttachments.Add(new ClinicRecordAttachment
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            Title = "CBC",
            FileName = "cbc.pdf",
            StorageUri = "https://r2.clinicez.ph/cbc.pdf",
            VerificationStatus = "PendingVerification"
        });
        await db.SaveChangesAsync();
        var attachmentId = await db.RecordAttachments.Select(a => a.Id).SingleAsync();

        var probe = new MessagingTestKit.SaveProbe();
        var publisher = new ClinicRecordEventPublisher(
            new InteropPublisher(db), MessagingTestKit.Addresses(db), NullLogger<ClinicRecordEventPublisher>.Instance);
        var handler = new VerifyRecordAttachmentCommandHandler(
            TestDbHelper.CreateRepository<ClinicRecordAttachment>(db, sieve), probe.Wrap(db, uow), _clinicContext, publisher);

        var result = await handler.Handle(new VerifyRecordAttachmentCommand(attachmentId, IsApproved: true), CancellationToken.None);

        result.VerificationStatus.Should().Be("Verified");
        probe.Saves.Should().ContainSingle().Which.PendingOutbox.Should().Be(1);
        var outbox = await db.InteropOutbox.SingleAsync();
        outbox.Type.Should().Be(InteropTypes.ClinicRecordVerified);
        outbox.CorrelationId.Should().Be(attachmentId);
        var envelope = InteropEnvelope.FromJson(outbox.EnvelopeJson);
        envelope.To.Kind.Should().Be(PartyKind.Patient);
        envelope.To.PatientId.Should().Be(syncId.ToString());
        envelope.From.FacilityId.Should().Be(_clinicId.ToString());
        envelope.GetPayload<ClinicRecordVerifiedEvent>().PatientId.Should().Be(syncId);
    }

    [Fact]
    public async Task RecordVerified_PatientWithoutAppAccount_QueuesNothing()
    {
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        MessagingTestKit.SeedClinic(db, _clinicId, TenantId);
        var patient = NewPatient(_clinicId, null);
        db.Patients.Add(patient);
        await db.SaveChangesAsync();
        var publisher = new ClinicRecordEventPublisher(
            new InteropPublisher(db), MessagingTestKit.Addresses(db), NullLogger<ClinicRecordEventPublisher>.Instance);

        var queued = await publisher.PublishRecordVerifiedAsync(
            new ClinicRecordVerifiedEvent { AttachmentId = Guid.NewGuid(), ClinicId = _clinicId, PatientId = patient.Id, TenantId = TenantId });

        queued.Should().BeFalse();
        (await db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    // ----- rx.issued on signing -----

    private async Task<(ApplicationDbContext Db, SignConsultationCommandHandler Handler, MessagingTestKit.SaveProbe Probe, Guid EncounterId, Guid SyncId)> ArrangeSign(bool withPrescription = true)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        MessagingTestKit.SeedClinic(db, _clinicId, TenantId, "Apex Clinic");
        var syncId = Guid.NewGuid();
        var patient = NewPatient(_clinicId, syncId);
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Ana",
            LastName = "Cruz",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0123456"
        };
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Santos",
            DoctorId = doctor.Id,
            DoctorName = "Dr. Ana Cruz",
            Assessment = "I10 Hypertension",
            Plan = "Amlodipine 5mg OD",
            Prescriptions = withPrescription
                ? new List<PrescriptionItem>
                {
                    new() { GenericName = "Amlodipine", Dosage = "5mg", Form = "Tablet", Sig = "1 tab daily", Quantity = 30 }
                }
                : new List<PrescriptionItem>()
        };
        db.Patients.Add(patient);
        db.StaffMembers.Add(doctor);
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var probe = new MessagingTestKit.SaveProbe();
        var handler = new SignConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<StaffMember>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve),
            TestDbHelper.CreateRepository<Appointment>(db, sieve),
            TestDbHelper.CreateRepository<ClinicPatient>(db, sieve),
            probe.Wrap(db, uow),
            _clinicContext,
            new ClinicIdentityProvider(db, _clinicContext),
            new PatientAppointmentPublisher(new InteropPublisher(db), MessagingTestKit.Addresses(db), NullLogger<PatientAppointmentPublisher>.Instance),
            new PrescriptionPublisher(new InteropPublisher(db)));
        return (db, handler, probe, encounter.Id, syncId);
    }

    [Fact]
    public async Task SignConsultation_WithPharmacyTarget_QueuesRxAndAppointmentUpdateInTheSameSave()
    {
        var (db, handler, probe, encounterId, syncId) = await ArrangeSign();
        var pharmacyId = Guid.NewGuid();

        var result = await handler.Handle(
            new SignConsultationCommand(encounterId, TargetPharmacyFacilityId: pharmacyId.ToString(), TargetPharmacyTenantId: "pharmacy-tenant"),
            CancellationToken.None);

        result.IsSigned.Should().BeTrue();
        probe.Saves.Should().ContainSingle().Which.PendingOutbox.Should().Be(2);

        var rx = await db.InteropOutbox.SingleAsync(o => o.Type == InteropTypes.RxIssued);
        rx.CorrelationId.Should().Be(encounterId);
        var rxEnvelope = InteropEnvelope.FromJson(rx.EnvelopeJson);
        rxEnvelope.To.Kind.Should().Be(PartyKind.Facility);
        rxEnvelope.To.FacilityId.Should().Be(pharmacyId.ToString());
        rxEnvelope.To.TenantId.Should().Be("pharmacy-tenant");
        rxEnvelope.From.FacilityId.Should().Be(_clinicId.ToString());
        var issued = rxEnvelope.GetPayload<PrescriptionIssuedEvent>();
        issued.PrescriptionId.Should().Be(encounterId);
        issued.Items.Should().ContainSingle().Which.GenericName.Should().Be("Amlodipine");
        issued.PrescriberDoctor.PrcLicenseNumber.Should().Be("0123456");

        var update = await db.InteropOutbox.SingleAsync(o => o.Type == InteropTypes.ClinicAppointmentUpdated);
        InteropEnvelope.FromJson(update.EnvelopeJson).To.PatientId.Should().Be(syncId.ToString());
    }

    [Fact]
    public async Task SignConsultation_WithoutPharmacyTarget_QueuesNoPrescription()
    {
        var (db, handler, probe, encounterId, _) = await ArrangeSign();

        await handler.Handle(new SignConsultationCommand(encounterId), CancellationToken.None);

        probe.Saves.Should().ContainSingle().Which.PendingOutbox.Should().Be(1);
        (await db.InteropOutbox.CountAsync(o => o.Type == InteropTypes.RxIssued)).Should().Be(0);
    }

    [Fact]
    public async Task SignConsultation_WithPharmacyTargetButNoPrescriptions_QueuesNoPrescription()
    {
        var (db, handler, _, encounterId, _) = await ArrangeSign(withPrescription: false);

        await handler.Handle(
            new SignConsultationCommand(encounterId, TargetPharmacyFacilityId: Guid.NewGuid().ToString(), TargetPharmacyTenantId: "pharmacy-tenant"),
            CancellationToken.None);

        (await db.InteropOutbox.CountAsync(o => o.Type == InteropTypes.RxIssued)).Should().Be(0);
    }

    [Theory]
    [InlineData("not-a-guid", "pharmacy-tenant")]
    [InlineData("3f2504e0-4f89-11d3-9a0c-0305e82c3301", null)]
    [InlineData(null, "pharmacy-tenant")]
    public async Task SignConsultation_MalformedOrIncompleteTarget_IsRejectedAndNothingIsSaved(string? facilityId, string? tenantId)
    {
        var (db, handler, probe, encounterId, _) = await ArrangeSign();

        var act = async () => await handler.Handle(
            new SignConsultationCommand(encounterId, TargetPharmacyFacilityId: facilityId, TargetPharmacyTenantId: tenantId),
            CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
        probe.Saves.Should().BeEmpty();
        (await db.InteropOutbox.CountAsync()).Should().Be(0);
        (await db.Consultations.SingleAsync()).IsSigned.Should().BeFalse();
    }

    // ----- local workspace lookup -----

    [Fact]
    public async Task TenantLookup_ResolvesProvisionedClinicBySlugGuidAndTenant()
    {
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var settings = MessagingTestKit.SeedClinic(db, _clinicId, TenantId, "Apex Clinic");
        settings.TenantSlug = "apex-group";
        settings.FacilitySlug = "apex-main";
        await db.SaveChangesAsync();
        var lookup = new TenantLookupService(db);

        var bySlug = await lookup.LookupFacilityAsync("Apex-Main");
        var byId = await lookup.LookupFacilityAsync(_clinicId.ToString());
        var byTenant = await lookup.LookupTenantAsync("apex-group");

        bySlug.Should().NotBeNull();
        bySlug!.FacilityId.Should().Be(_clinicId);
        bySlug.FacilitySlug.Should().Be("apex-main");
        byId!.FacilityId.Should().Be(_clinicId);
        byTenant.Should().NotBeNull();
        byTenant!.Slug.Should().Be("apex-group");
        (await lookup.LookupFacilityAsync("unknown-slug")).Should().BeNull();
        (await lookup.LookupTenantAsync("tenant_default")).Should().BeNull();
    }
}
