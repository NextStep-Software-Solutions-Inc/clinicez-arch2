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
using ClinicEz.Shared.Licensing;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicInboundHandlerTests
{
    private const string TenantId = "tenant_test";

    private static DiagnosticReportFinalizedHandler FinalizedHandler(ApplicationDbContext db) =>
        new(db, MessagingTestKit.Recipient(db), new Phase3TestKit.InMemoryFileStore(), Phase3TestKit.Documents(db),
            NullLogger<DiagnosticReportFinalizedHandler>.Instance);

    private static LabPanicResultAlertHandler PanicHandler(ApplicationDbContext db) =>
        new(db, MessagingTestKit.Recipient(db), NullLogger<LabPanicResultAlertHandler>.Instance);

    private static PrescriptionDispensedHandler DispensedHandler(ApplicationDbContext db) =>
        new(db, MessagingTestKit.Recipient(db), NullLogger<PrescriptionDispensedHandler>.Instance);

    private static FacilityCreatedHandler FacilityHandler(ApplicationDbContext db) =>
        new(db, new InteropPublisher(db), new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem), NullLogger<FacilityCreatedHandler>.Instance);

    private static FacilityDirectoryUpdatedHandler DirectoryUpdatedHandler(ApplicationDbContext db) =>
        new(db, NullLogger<FacilityDirectoryUpdatedHandler>.Instance);

    private static LabOrder SeedLabOrder(ApplicationDbContext db, Guid clinicId, string orderNumber = "LAB-0001")
    {
        var order = new LabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = clinicId,
            OrderNumber = orderNumber,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Santos",
            Items = new List<LabOrderItem>
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

        var saved = await db.LabOrders.IgnoreQueryFilters().Include(o => o.Items).Include(o => o.Observations).SingleAsync();
        saved.Status.Should().Be(LabOrderStatus.ResultsReceived);
        saved.ExternalLabName.Should().Be("Hi-Precision");
        saved.VerifiedByPathologist.Should().Be("Dr. Reyes");
        saved.PathologistImpression.Should().Be("Unremarkable");
        saved.Observations.Should().Contain(o => o.AnalyteCode == "HGB");
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

        (await db.LabOrders.IgnoreQueryFilters().CountAsync()).Should().Be(1);
        var saved = await db.LabOrders.IgnoreQueryFilters().Include(o => o.Items).SingleAsync();
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

        (await db.LabOrders.IgnoreQueryFilters().SingleAsync(o => o.Id == order.Id)).Status.Should().Be(LabOrderStatus.Ordered);
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

        (await db.LabOrders.IgnoreQueryFilters().SingleAsync()).Status.Should().Be(LabOrderStatus.Ordered);
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

        (await db.LabOrders.IgnoreQueryFilters().SingleAsync()).Status.Should().Be(LabOrderStatus.Ordered);
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

        (await db.LabOrders.IgnoreQueryFilters().SingleAsync()).Status.Should().Be(LabOrderStatus.Ordered);
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

        var saved = await db.LabOrders.IgnoreQueryFilters().Include(o => o.Observations).SingleAsync();
        saved.HasCriticalPanicAlert.Should().BeTrue();
        saved.Observations.Should().Contain(o => o.IsCriticalPanic && o.ValueText.Contains("6.9"));
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

        (await db.LabOrders.IgnoreQueryFilters().CountAsync()).Should().Be(1);
        (await db.LabOrders.IgnoreQueryFilters().SingleAsync()).PanicAlertTriggeredAt.Should().Be(alert.TriggeredAt);
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

        (await db.LabOrders.IgnoreQueryFilters().SingleAsync()).HasCriticalPanicAlert.Should().BeFalse();
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

        var saved = await db.Consultations.IgnoreQueryFilters().SingleAsync();
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
        var afterFirst = (await db.Consultations.IgnoreQueryFilters().SingleAsync()).RxNotes;
        await DispensedHandler(db).HandleAsync(dispensed, context, CancellationToken.None);

        (await db.Consultations.IgnoreQueryFilters().CountAsync()).Should().Be(1);
        var saved = await db.Consultations.IgnoreQueryFilters().SingleAsync();
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

        (await db.Consultations.IgnoreQueryFilters().SingleAsync()).RxDispenseStatus.Should().NotBe(PrescriptionDispenseStatus.DispensedAtPartnerPharmacy);
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

        (await db.Consultations.IgnoreQueryFilters().SingleAsync()).RxDispenseStatus.Should().NotBe(PrescriptionDispenseStatus.DispensedAtPartnerPharmacy);
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

        (await db.Consultations.IgnoreQueryFilters().SingleAsync()).RxDispenseStatus.Should().NotBe(PrescriptionDispenseStatus.DispensedAtPartnerPharmacy);
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

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync();
        settings.ClinicId.Should().Be(clinicId);
        settings.TenantId.Should().Be(TenantId);
        settings.TenantSlug.Should().Be("apex-group");
        settings.FacilitySlug.Should().Be("apex-main");
        settings.ClinicName.Should().Be("Apex Clinic");
        settings.LicenseToken.Should().Be("signed-token");
        settings.PlanTier.Should().Be("Pro");
        settings.IsWorkspaceEligible.Should().BeFalse();

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
    public async Task FacilityLicense_WhenIsWorkspaceEligibleSpecified_MapsToSettings()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var license = LicenseFor(clinicId) with { IsWorkspaceEligible = true };

        await FacilityHandler(db).HandleAsync(
            license, License(license, Party.Portal, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync();
        settings.IsWorkspaceEligible.Should().BeTrue();

        // Also verify redelivery with updated eligibility updates existing settings
        var updatedLicense = license with { IsWorkspaceEligible = false };
        await FacilityHandler(db).HandleAsync(
            updatedLicense, License(updatedLicense, Party.Portal, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        var updatedSettings = await db.Settings.IgnoreQueryFilters().SingleAsync();
        updatedSettings.IsWorkspaceEligible.Should().BeFalse();
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

        (await db.Settings.IgnoreQueryFilters().CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task FacilityLicense_FromANonControlPlaneSender_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var license = LicenseFor(clinicId);

        await FacilityHandler(db).HandleAsync(
            license, License(license, MessagingTestKit.LabParty(), MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        (await db.Settings.IgnoreQueryFilters().CountAsync()).Should().Be(0);
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

        (await db.Settings.IgnoreQueryFilters().CountAsync()).Should().Be(0);
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

        (await db.Settings.IgnoreQueryFilters().CountAsync()).Should().Be(0);
    }

    // ----- facility.directory.updated -----

    private static FacilityCreatedEvent DirectoryUpdateFor(Guid clinicId, string tenantId = TenantId, bool isWorkspaceEligible = true) => new()
    {
        TenantId = tenantId,
        TenantSlug = "apex-group",
        FacilityType = FacilityType.Clinic,
        ResourceId = clinicId,
        Name = "Apex Clinic Main",
        Slug = "apex-main",
        IsWorkspaceEligible = isWorkspaceEligible
    };

    private static InteropMessageContext DirectoryUpdate(FacilityCreatedEvent evt, Party from, Party to, Guid? correlationId = null) =>
        MessagingTestKit.Delivered(InteropTypes.FacilityDirectoryUpdated, from, to, correlationId ?? Guid.NewGuid(), evt);

    [Fact]
    public async Task FacilityDirectoryUpdated_FromPortal_UpdatesIsWorkspaceEligibleAndMetadata()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Original Name");

        var updateEvt = DirectoryUpdateFor(clinicId, TenantId, isWorkspaceEligible: true) with
        {
            Name = "Updated Clinic Name",
            Slug = "updated-slug",
            TenantSlug = "updated-tenant-slug"
        };

        await DirectoryUpdatedHandler(db).HandleAsync(
            updateEvt,
            DirectoryUpdate(updateEvt, Party.Portal, MessagingTestKit.ClinicParty(TenantId, clinicId)),
            CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeTrue();
        settings.ClinicName.Should().Be("Updated Clinic Name");
        settings.FacilitySlug.Should().Be("updated-slug");
        settings.TenantSlug.Should().Be("updated-tenant-slug");
        settings.UpdatedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task FacilityDirectoryUpdated_WhenWorkspaceRevoked_UpdatesIsWorkspaceEligibleToFalse()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var existing = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Eligible Clinic");
        existing.IsWorkspaceEligible = true;
        await db.SaveChangesAsync();

        var updateEvt = DirectoryUpdateFor(clinicId, TenantId, isWorkspaceEligible: false);

        await DirectoryUpdatedHandler(db).HandleAsync(
            updateEvt,
            DirectoryUpdate(updateEvt, Party.Portal, MessagingTestKit.ClinicParty(TenantId, clinicId)),
            CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse("Portal revoked workspace discovery eligibility");
    }

    [Fact]
    public async Task FacilityDirectoryUpdated_FromNonControlPlaneSender_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Untouched Clinic");

        var updateEvt = DirectoryUpdateFor(clinicId, TenantId, isWorkspaceEligible: true);

        // From Lab
        await DirectoryUpdatedHandler(db).HandleAsync(
            updateEvt,
            DirectoryUpdate(updateEvt, MessagingTestKit.LabParty(), MessagingTestKit.ClinicParty(TenantId, clinicId)),
            CancellationToken.None);

        // From another Clinic
        await DirectoryUpdatedHandler(db).HandleAsync(
            updateEvt,
            DirectoryUpdate(updateEvt, MessagingTestKit.ClinicParty(TenantId, Guid.NewGuid()), MessagingTestKit.ClinicParty(TenantId, clinicId)),
            CancellationToken.None);

        // From Patient
        await DirectoryUpdatedHandler(db).HandleAsync(
            updateEvt,
            DirectoryUpdate(updateEvt, Party.ForPatient(Guid.NewGuid().ToString()), MessagingTestKit.ClinicParty(TenantId, clinicId)),
            CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse("Non-control-plane sender must be rejected");
        settings.ClinicName.Should().Be("Untouched Clinic");
    }

    [Fact]
    public async Task FacilityDirectoryUpdated_AddressedToAnotherFacilityOrTenant_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Untouched Clinic");

        var updateEvt = DirectoryUpdateFor(clinicId, TenantId, isWorkspaceEligible: true);

        // Addressed to another facility ID
        await DirectoryUpdatedHandler(db).HandleAsync(
            updateEvt,
            DirectoryUpdate(updateEvt, Party.Portal, MessagingTestKit.ClinicParty(TenantId, Guid.NewGuid())),
            CancellationToken.None);

        // Addressed to another tenant
        await DirectoryUpdatedHandler(db).HandleAsync(
            updateEvt,
            DirectoryUpdate(updateEvt, Party.Portal, MessagingTestKit.ClinicParty("different_tenant", clinicId)),
            CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse();
        settings.ClinicName.Should().Be("Untouched Clinic");
    }

    [Fact]
    public async Task FacilityDirectoryUpdated_ForAnotherFacilityType_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Untouched Clinic");

        var updateEvt = DirectoryUpdateFor(clinicId, TenantId, isWorkspaceEligible: true) with
        {
            FacilityType = FacilityType.Pharmacy
        };

        await DirectoryUpdatedHandler(db).HandleAsync(
            updateEvt,
            DirectoryUpdate(updateEvt, Party.Portal, MessagingTestKit.ClinicParty(TenantId, clinicId)),
            CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse();
    }

    [Fact]
    public async Task FacilityDirectoryUpdated_BypassesAmbientMultiTenantQueryFilter()
    {
        var activeClinicId = Guid.NewGuid();
        var foreignClinicId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(activeClinicId);
        clinicContext.TenantId.Returns("active_tenant");

        using var db = MessagingTestKit.CreateDbContext(clinicContext);

        // Seed foreign clinic in db
        MessagingTestKit.SeedClinic(db, foreignClinicId, "foreign_tenant", "Foreign Clinic");

        // Verify standard query without IgnoreQueryFilters() hides the foreign clinic due to active filter
        var visibleStandard = await db.Settings.FirstOrDefaultAsync(s => s.ClinicId == foreignClinicId);
        visibleStandard.Should().BeNull("Global query filter hides foreign clinic settings");

        var updateEvt = DirectoryUpdateFor(foreignClinicId, "foreign_tenant", isWorkspaceEligible: true) with
        {
            Name = "Updated Foreign Clinic"
        };

        // FacilityDirectoryUpdatedHandler uses IgnoreQueryFilters() and must successfully find and update it
        await DirectoryUpdatedHandler(db).HandleAsync(
            updateEvt,
            DirectoryUpdate(updateEvt, Party.Portal, MessagingTestKit.ClinicParty("foreign_tenant", foreignClinicId)),
            CancellationToken.None);

        var updated = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == foreignClinicId);
        updated.IsWorkspaceEligible.Should().BeTrue("Handler must bypass ambient query filter to update settings");
        updated.ClinicName.Should().Be("Updated Foreign Clinic");
    }
}
