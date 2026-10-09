using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicInboundHandlerTests
{
    private const string TenantId = "tenant_test";

    private static DiagnosticReportFinalizedHandler FinalizedHandler(ApplicationDbContext db) =>
        new(db, MessagingTestKit.Recipient(db), NullLogger<DiagnosticReportFinalizedHandler>.Instance);

    private static LabPanicResultAlertHandler PanicHandler(ApplicationDbContext db) =>
        new(db, MessagingTestKit.Recipient(db), NullLogger<LabPanicResultAlertHandler>.Instance);

    private static PrescriptionDispensedHandler DispensedHandler(ApplicationDbContext db) =>
        new(db, MessagingTestKit.Recipient(db), NullLogger<PrescriptionDispensedHandler>.Instance);

    private static FacilityCreatedHandler FacilityHandler(ApplicationDbContext db) =>
        new(db, new InteropPublisher(db), NullLogger<FacilityCreatedHandler>.Instance);

    private static ClinicLabOrder SeedLabOrder(ApplicationDbContext db, Guid clinicId, string orderNumber = "LAB-0001")
    {
        var order = new ClinicLabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = clinicId,
            OrderNumber = orderNumber,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Santos",
            Items = new List<ClinicLabOrderItem>
            {
                new() { TestName = "CBC", Category = "Hematology" },
                new() { TestName = "FBS", Category = "Chemistry" }
            }
        };
        db.LabOrders.Add(order);
        db.SaveChanges();
        return order;
    }

    private static ConsultationEncounter SeedEncounter(ApplicationDbContext db, Guid clinicId)
    {
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Santos",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Ana Cruz",
            PrescriptionNumber = "RX-20260925-ABC123"
        };
        db.Consultations.Add(encounter);
        db.SaveChanges();
        return encounter;
    }

    private static InteropMessageContext FromLab<T>(string type, Guid correlationId, T payload, Party to) =>
        MessagingTestKit.Delivered(type, MessagingTestKit.LabParty(), to, correlationId, payload);

    private static InteropMessageContext FromPharmacy(Guid correlationId, PrescriptionDispensedEvent payload, Party to) =>
        MessagingTestKit.Delivered(InteropTypes.RxDispensed, MessagingTestKit.PharmacyParty(), to, correlationId, payload);

    // ----- lab.result.finalized -----

    [Fact]
    public async Task Finalized_MatchingCorrelation_AttachesReportToOrder()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var order = SeedLabOrder(db, clinicId);
        var report = new DiagnosticReportFinalizedEvent
        {
            RequisitionId = order.Id,
            AccessionNumber = "ACC-77",
            LaboratoryName = "Hi-Precision",
            PathologistName = "Dr. Reyes",
            PathologistPrcLicense = "0099887",
            PathologistImpression = "Unremarkable",
            Observations = new List<AnalyteObservationDto> { new() { AnalyteCode = "HGB", Value = "13.2" } }
        };

        await FinalizedHandler(db).HandleAsync(
            report, FromLab(InteropTypes.LabResultFinalized, order.Id, report, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        var saved = await db.LabOrders.Include(o => o.Items).SingleAsync();
        saved.Status.Should().Be(LabOrderStatus.ResultsReceived);
        saved.ExternalLabName.Should().Be("Hi-Precision");
        saved.VerifiedByPathologist.Should().Be("Dr. Reyes");
        saved.PathologistImpression.Should().Be("Unremarkable");
        saved.ObservationsJson.Should().Contain("HGB");
        saved.Items.Should().OnlyContain(i => i.Status == LabOrderStatus.ResultsReceived);
    }

    [Fact]
    public async Task Finalized_RedeliveredMessage_HasTheEffectOfOneDelivery()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var order = SeedLabOrder(db, clinicId);
        var report = new DiagnosticReportFinalizedEvent { RequisitionId = order.Id, LaboratoryName = "Hi-Precision", PathologistName = "Dr. Reyes" };
        var context = FromLab(InteropTypes.LabResultFinalized, order.Id, report, MessagingTestKit.ClinicParty(TenantId, clinicId));

        await FinalizedHandler(db).HandleAsync(report, context, CancellationToken.None);
        await FinalizedHandler(db).HandleAsync(report, context, CancellationToken.None);

        (await db.LabOrders.CountAsync()).Should().Be(1);
        var saved = await db.LabOrders.Include(o => o.Items).SingleAsync();
        saved.Status.Should().Be(LabOrderStatus.ResultsReceived);
        saved.Items.Should().HaveCount(2);
        (await db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Finalized_NeverMatchesByAccessionOrOrderNumber()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var order = SeedLabOrder(db, clinicId, "LAB-0001");
        var report = new DiagnosticReportFinalizedEvent { RequisitionId = Guid.Empty, AccessionNumber = "LAB-0001", LaboratoryName = "Hi-Precision" };

        await FinalizedHandler(db).HandleAsync(
            report, FromLab(InteropTypes.LabResultFinalized, Guid.NewGuid(), report, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        (await db.LabOrders.SingleAsync(o => o.Id == order.Id)).Status.Should().Be(LabOrderStatus.Ordered);
    }

    [Fact]
    public async Task Finalized_PayloadRequisitionDifferentFromCorrelation_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var order = SeedLabOrder(db, clinicId);
        var report = new DiagnosticReportFinalizedEvent { RequisitionId = Guid.NewGuid(), LaboratoryName = "Hi-Precision" };

        await FinalizedHandler(db).HandleAsync(
            report, FromLab(InteropTypes.LabResultFinalized, order.Id, report, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        (await db.LabOrders.SingleAsync()).Status.Should().Be(LabOrderStatus.Ordered);
    }

    [Fact]
    public async Task Finalized_AddressedToAnotherClinicOrTenant_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var order = SeedLabOrder(db, clinicId);
        var report = new DiagnosticReportFinalizedEvent { RequisitionId = order.Id, LaboratoryName = "Hi-Precision" };

        await FinalizedHandler(db).HandleAsync(
            report, FromLab(InteropTypes.LabResultFinalized, order.Id, report, MessagingTestKit.ClinicParty(TenantId, Guid.NewGuid())), CancellationToken.None);
        await FinalizedHandler(db).HandleAsync(
            report, FromLab(InteropTypes.LabResultFinalized, order.Id, report, MessagingTestKit.ClinicParty("another_tenant", clinicId)), CancellationToken.None);

        (await db.LabOrders.SingleAsync()).Status.Should().Be(LabOrderStatus.Ordered);
    }

    [Fact]
    public async Task Finalized_OrderOfAnotherClinicOnTheSameServer_IsNotTouched()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicA, TenantId);
        MessagingTestKit.SeedClinic(db, clinicB, "tenant_b");
        var orderOfB = SeedLabOrder(db, clinicB);
        var report = new DiagnosticReportFinalizedEvent { RequisitionId = orderOfB.Id, LaboratoryName = "Hi-Precision" };

        await FinalizedHandler(db).HandleAsync(
            report, FromLab(InteropTypes.LabResultFinalized, orderOfB.Id, report, MessagingTestKit.ClinicParty(TenantId, clinicA)), CancellationToken.None);

        (await db.LabOrders.SingleAsync()).Status.Should().Be(LabOrderStatus.Ordered);
    }

    // ----- lab.result.panic -----

    [Fact]
    public async Task Panic_MatchingCorrelation_FlagsTheOrder()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var order = SeedLabOrder(db, clinicId);
        var alert = new LabPanicResultAlertEvent
        {
            RequisitionId = order.Id,
            CriticalFindings = new List<CriticalFindingDto> { new() { AnalyteCode = "K", ObservedValue = "6.9" } }
        };

        await PanicHandler(db).HandleAsync(
            alert, FromLab(InteropTypes.LabResultPanic, order.Id, alert, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        var saved = await db.LabOrders.SingleAsync();
        saved.HasCriticalPanicAlert.Should().BeTrue();
        saved.CriticalFindingsJson.Should().Contain("6.9");
        saved.PanicAlertTriggeredAt.Should().Be(alert.TriggeredAt);
    }

    [Fact]
    public async Task Panic_UnknownRequisition_CreatesNoOrder()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var alert = new LabPanicResultAlertEvent { RequisitionId = Guid.NewGuid(), PatientName = "Unknown" };

        await PanicHandler(db).HandleAsync(
            alert, FromLab(InteropTypes.LabResultPanic, alert.RequisitionId, alert, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        (await db.LabOrders.IgnoreQueryFilters().CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Panic_RedeliveredMessage_HasTheEffectOfOneDelivery()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var order = SeedLabOrder(db, clinicId);
        var alert = new LabPanicResultAlertEvent { RequisitionId = order.Id };
        var context = FromLab(InteropTypes.LabResultPanic, order.Id, alert, MessagingTestKit.ClinicParty(TenantId, clinicId));

        await PanicHandler(db).HandleAsync(alert, context, CancellationToken.None);
        await PanicHandler(db).HandleAsync(alert, context, CancellationToken.None);

        (await db.LabOrders.CountAsync()).Should().Be(1);
        (await db.LabOrders.SingleAsync()).PanicAlertTriggeredAt.Should().Be(alert.TriggeredAt);
    }

    [Fact]
    public async Task Panic_AddressedToAnotherTenant_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var order = SeedLabOrder(db, clinicId);
        var alert = new LabPanicResultAlertEvent { RequisitionId = order.Id };

        await PanicHandler(db).HandleAsync(
            alert, FromLab(InteropTypes.LabResultPanic, order.Id, alert, MessagingTestKit.ClinicParty("another_tenant", clinicId)), CancellationToken.None);

        (await db.LabOrders.SingleAsync()).HasCriticalPanicAlert.Should().BeFalse();
    }

    // ----- rx.dispensed -----

    [Fact]
    public async Task Dispensed_MatchingCorrelation_RecordsDispenseOnEncounter()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var encounter = SeedEncounter(db, clinicId);
        var dispensed = new PrescriptionDispensedEvent
        {
            PrescriptionId = encounter.Id,
            PharmacyFacilityName = "Mercury Drug",
            DispensingPharmacistName = "Ph. Dela Cruz",
            DispensingPharmacistPrcLicense = "0112233",
            ReceiptNumber = "OR-1001",
            TotalAmount = 250m,
            Notes = "Counselled"
        };

        await DispensedHandler(db).HandleAsync(
            dispensed, FromPharmacy(encounter.Id, dispensed, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        var saved = await db.Consultations.SingleAsync();
        saved.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.DispensedAtPartnerPharmacy);
        saved.RxDispensedPharmacyName.Should().Be("Mercury Drug");
        saved.RxDispensedPharmacistPrc.Should().Be("0112233");
        saved.RxDispensedReceiptNumber.Should().Be("OR-1001");
        saved.RxNotes.Should().Contain("250.00").And.Contain("Counselled");
    }

    [Fact]
    public async Task Dispensed_RedeliveredMessage_HasTheEffectOfOneDelivery()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var encounter = SeedEncounter(db, clinicId);
        var dispensed = new PrescriptionDispensedEvent { PrescriptionId = encounter.Id, PharmacyFacilityName = "Mercury Drug", TotalAmount = 100m };
        var context = FromPharmacy(encounter.Id, dispensed, MessagingTestKit.ClinicParty(TenantId, clinicId));

        await DispensedHandler(db).HandleAsync(dispensed, context, CancellationToken.None);
        var afterFirst = (await db.Consultations.SingleAsync()).RxNotes;
        await DispensedHandler(db).HandleAsync(dispensed, context, CancellationToken.None);

        (await db.Consultations.CountAsync()).Should().Be(1);
        var saved = await db.Consultations.SingleAsync();
        saved.RxNotes.Should().Be(afterFirst);
        saved.RxDispensedAt.Should().Be(dispensed.DispensedAt);
    }

    [Fact]
    public async Task Dispensed_NeverMatchesByPrescriptionNumber()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var encounter = SeedEncounter(db, clinicId);
        var dispensed = new PrescriptionDispensedEvent { PrescriptionNumber = encounter.PrescriptionNumber!, PharmacyFacilityName = "Mercury Drug" };

        await DispensedHandler(db).HandleAsync(
            dispensed, FromPharmacy(Guid.NewGuid(), dispensed, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        (await db.Consultations.SingleAsync()).RxDispenseStatus.Should().NotBe(PrescriptionDispenseStatus.DispensedAtPartnerPharmacy);
    }

    [Fact]
    public async Task Dispensed_AddressedToAnotherClinicOrTenant_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var encounter = SeedEncounter(db, clinicId);
        var dispensed = new PrescriptionDispensedEvent { PrescriptionId = encounter.Id, PharmacyFacilityName = "Mercury Drug" };

        await DispensedHandler(db).HandleAsync(
            dispensed, FromPharmacy(encounter.Id, dispensed, MessagingTestKit.ClinicParty(TenantId, Guid.NewGuid())), CancellationToken.None);
        await DispensedHandler(db).HandleAsync(
            dispensed, FromPharmacy(encounter.Id, dispensed, MessagingTestKit.ClinicParty("another_tenant", clinicId)), CancellationToken.None);

        (await db.Consultations.SingleAsync()).RxDispenseStatus.Should().NotBe(PrescriptionDispenseStatus.DispensedAtPartnerPharmacy);
    }

    [Fact]
    public async Task Dispensed_EncounterOfAnotherClinicOnTheSameServer_IsNotTouched()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicA, TenantId);
        MessagingTestKit.SeedClinic(db, clinicB, "tenant_b");
        var encounterOfB = SeedEncounter(db, clinicB);
        var dispensed = new PrescriptionDispensedEvent { PrescriptionId = encounterOfB.Id, PharmacyFacilityName = "Mercury Drug" };

        await DispensedHandler(db).HandleAsync(
            dispensed, FromPharmacy(encounterOfB.Id, dispensed, MessagingTestKit.ClinicParty(TenantId, clinicA)), CancellationToken.None);

        (await db.Consultations.SingleAsync()).RxDispenseStatus.Should().NotBe(PrescriptionDispenseStatus.DispensedAtPartnerPharmacy);
    }

    // ----- facility.license.issued -----

    private static FacilityCreatedEvent LicenseFor(Guid clinicId, string tenantId = TenantId) => new()
    {
        TenantId = tenantId,
        TenantSlug = "apex-group",
        FacilityType = FacilityType.Clinic,
        ResourceId = clinicId,
        Name = "Apex Clinic",
        Slug = "apex-main",
        LicenseToken = "signed-token",
        PlanTier = "Pro"
    };

    private static InteropMessageContext License(FacilityCreatedEvent license, Party from, Party to, Guid? correlationId = null) =>
        MessagingTestKit.Delivered(InteropTypes.FacilityLicenseIssued, from, to, correlationId ?? Guid.NewGuid(), license);

    [Fact]
    public async Task FacilityLicense_FromControlPlane_ProvisionsClinicAndConfirmsToPortal()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var correlationId = Guid.NewGuid();
        var license = LicenseFor(clinicId);

        await FacilityHandler(db).HandleAsync(
            license, License(license, Party.Portal, MessagingTestKit.ClinicParty(TenantId, clinicId), correlationId), CancellationToken.None);

        var settings = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync();
        settings.ClinicId.Should().Be(clinicId);
        settings.TenantId.Should().Be(TenantId);
        settings.TenantSlug.Should().Be("apex-group");
        settings.FacilitySlug.Should().Be("apex-main");
        settings.ClinicName.Should().Be("Apex Clinic");
        settings.LicenseToken.Should().Be("signed-token");
        settings.PlanTier.Should().Be("Pro");

        var outbox = await db.InteropOutbox.SingleAsync();
        outbox.Type.Should().Be(InteropTypes.FacilityProvisioned);
        outbox.CorrelationId.Should().Be(correlationId);
        var envelope = InteropEnvelope.FromJson(outbox.EnvelopeJson);
        envelope.To.Kind.Should().Be(PartyKind.ControlPlane);
        envelope.From.FacilityId.Should().Be(clinicId.ToString());
        var confirmation = envelope.GetPayload<FacilityProvisionedEvent>();
        confirmation.ResourceId.Should().Be(clinicId);
        confirmation.Success.Should().BeTrue();
    }

    [Fact]
    public async Task FacilityLicense_Redelivered_UpdatesTheSameSettingsRow()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var license = LicenseFor(clinicId);
        var context = License(license, Party.Portal, MessagingTestKit.ClinicParty(TenantId, clinicId));

        await FacilityHandler(db).HandleAsync(license, context, CancellationToken.None);
        await FacilityHandler(db).HandleAsync(license, context, CancellationToken.None);

        (await db.ClinicSettings.IgnoreQueryFilters().CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task FacilityLicense_FromANonControlPlaneSender_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var license = LicenseFor(clinicId);

        await FacilityHandler(db).HandleAsync(
            license, License(license, MessagingTestKit.LabParty(), MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        (await db.ClinicSettings.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task FacilityLicense_AddressedToAnotherFacilityOrTenant_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var license = LicenseFor(clinicId);

        await FacilityHandler(db).HandleAsync(
            license, License(license, Party.Portal, MessagingTestKit.ClinicParty(TenantId, Guid.NewGuid())), CancellationToken.None);
        await FacilityHandler(db).HandleAsync(
            license, License(license, Party.Portal, MessagingTestKit.ClinicParty("another_tenant", clinicId)), CancellationToken.None);

        (await db.ClinicSettings.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task FacilityLicense_ForAnotherFacilityType_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var facilityId = Guid.NewGuid();
        var license = LicenseFor(facilityId) with { FacilityType = FacilityType.Pharmacy };

        await FacilityHandler(db).HandleAsync(
            license, License(license, Party.Portal, MessagingTestKit.ClinicParty(TenantId, facilityId)), CancellationToken.None);

        (await db.ClinicSettings.IgnoreQueryFilters().CountAsync()).Should().Be(0);
    }
}
