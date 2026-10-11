using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Interop;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Infrastructure.Context;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Sieve.Services;

namespace ClinicEz.Laboratory.Application.Tests;

/// <summary>Shared fixtures for the laboratory interop tests: one laboratory and two ordering clinics.</summary>
internal static class LabInteropTestData
{
    public const string LabTenant = "tenant-lab";
    public static readonly Guid LabId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    /// <summary>A second laboratory of ANOTHER tenant, used by the isolation tests.</summary>
    public const string OtherLabTenant = "tenant-other-lab";
    public static readonly Guid OtherLabId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    public static Party Lab => Party.ForFacility(LabTenant, LabId.ToString(), FacilityType.Laboratory);

    public static Party OtherLab => Party.ForFacility(OtherLabTenant, OtherLabId.ToString(), FacilityType.Laboratory);

    /// <summary>The billing mailbox of the laboratory: the only sender accepted for <c>billing.payment.confirmed</c>.</summary>
    public static Party LabBilling =>
        Party.ForFacility(LabTenant, LabId.ToString(), FacilityType.Laboratory, InteropServices.Billing);

    public static Party ClinicA =>
        Party.ForFacility("tenant-a", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", FacilityType.Clinic);

    public static Party ClinicB =>
        Party.ForFacility("tenant-b", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", FacilityType.Clinic);

    /// <summary>
    /// Existing tests exercise the order flow, not the payment gate, so the default laboratory does not bill
    /// (<see cref="PaymentPolicy.None"/>); payment tests pass the policy they need.
    /// </summary>
    public static async Task SeedLabAsync(
        ApplicationDbContext db,
        PaymentPolicy paymentPolicy = PaymentPolicy.None,
        string tenantId = LabTenant,
        Guid? laboratoryId = null,
        string name = "Test Laboratory")
    {
        db.LabSettings.Add(new LabSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            LaboratoryId = laboratoryId ?? LabId,
            LaboratoryName = name,
            PaymentPolicy = paymentPolicy
        });
        await db.SaveChangesAsync();
    }

    public static ILabContext CreateLabContext() => new LabContext(new HttpContextAccessor());

    public static async Task<LabOrderIssuedHandler> CreateOrderHandlerAsync(
        ApplicationDbContext db, IUnitOfWork uow, ISieveProcessor sieve)
    {
        await SeedLabAsync(db);
        return new LabOrderIssuedHandler(
            LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve),
            LabTestDbHelper.CreateRepository<LabSettings>(db, sieve),
            uow,
            CreateLabContext(),
            LabTestDbHelper.CreateLifecycle(db, sieve),
            LabTestDbHelper.CreateBilling(db, sieve, Substitute.For<IInteropPublisher>()),
            NullLogger<LabOrderIssuedHandler>.Instance);
    }

    /// <param name="targetFacilityId">The laboratory the clinic routed the order to; null for an order that travels on a claim slip.</param>
    /// <param name="patientId">Use <see cref="Guid.Empty"/> for a patient who is not a ClinicEZ patient.</param>
    public static LabRequisitionIssuedEvent Order(
        string accessionNumber, Guid? requisitionId = null, string? targetFacilityId = null, Guid? patientId = null) => new()
    {
        RequisitionId = requisitionId ?? Guid.NewGuid(),
        AccessionNumber = accessionNumber,
        TargetFacilityId = targetFacilityId,
        OrderingFacilityName = "Metro Health Clinic",
        OrderingDoctor = new OrderingDoctorDto { DoctorName = "Dr. Alice Tan", PrcLicenseNumber = "PRC-0012345" },
        Patient = new RequisitionPatientDto { PatientId = patientId ?? Guid.NewGuid(), FullName = "Clara Gomez", Age = 28, Gender = "Female" },
        Items = new List<RequisitionItemDto> { new() { ItemName = "Fasting Blood Sugar", ItemCode = "FBS", Category = "Clinical Chemistry" } }
    };

    /// <summary>The envelope a clinic sends: correlation id is the clinic's requisition id.</summary>
    public static InteropEnvelope OrderEnvelope(LabRequisitionIssuedEvent order, Party from, Party? to = null) =>
        InteropEnvelope.Create(InteropTypes.LabOrderIssued, from, to ?? Lab, order.RequisitionId, order);

    /// <summary>The cashier's confirmation, as billing sends it to the laboratory.</summary>
    public static InteropEnvelope PaymentConfirmedEnvelope(
        Guid invoiceRequestId, bool fullyPaid = true, Party? from = null, Party? to = null, Guid? invoiceId = null) =>
        InteropEnvelope.Create(
            InteropTypes.BillingPaymentConfirmed,
            from ?? LabBilling,
            to ?? Lab,
            invoiceRequestId,
            new BillingPaymentConfirmedPayload
            {
                InvoiceRequestId = invoiceRequestId,
                InvoiceId = invoiceId ?? Guid.NewGuid(),
                SourceType = LabOrderBilling.LabOrderSourceType,
                AmountDue = 350m,
                AmountPaid = fullyPaid ? 350m : 100m,
                FullyPaid = fullyPaid,
                PaymentMethod = "Cash",
                ReceiptNumber = "OR-0001"
            });
}
