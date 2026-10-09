using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using FluentAssertions;
using InvoiceStatus = ClinicEz.Billing.Domain.Enums.InvoiceStatus;
using StaffRole = ClinicEz.Billing.Domain.Enums.StaffRole;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Flow F for the pharmacy: a supervisor voids or refunds a prescription invoice at the billing desk. Before dispensing the order
/// goes back to awaiting payment (blocking a Prepaid dispense), billing is asked again under the same order id and reopens the
/// same invoice; after dispensing the correction is only recorded.
/// </summary>
public class PharmacyBillingCorrectionFlowTests
{
    private const string Medicine = "Amoxicillin";
    private const int Quantity = 6;
    private const decimal UnitPrice = 15m;

    [Fact]
    public async Task VoidedPharmacyInvoice_IsReopenedForTheSameOrder_AndCanBePaidAndDispensed()
    {
        var (cell, pharmacy, order) = await AcceptedOrderAsync();
        await using var _ = cell;
        var invoice = await cell.Billing.InvoiceForAsync(pharmacy, order.Id);

        cell.Billing.SignIn(pharmacy.Tenant, pharmacy.FacilityId, StaffRole.Supervisor);
        await cell.Billing.VoidAsync(invoice.Id, "Wrong patient");
        cell.Billing.SignOut();
        await cell.PumpAsync();

        order = await PharmacySeed.OrderAsync(cell.Pharmacy, pharmacy);
        order.PaymentStatus.Should().Be(PrescriptionPaymentStatus.AwaitingPayment);
        order.PaymentCorrectedAt.Should().NotBeNull();
        var reopened = await cell.Billing.InvoiceForAsync(pharmacy, order.Id);
        reopened.Id.Should().Be(invoice.Id, "billing reopens the corrected invoice instead of creating a second one");
        reopened.Status.Should().Be(InvoiceStatus.Open);
        reopened.Total.Should().Be(Quantity * UnitPrice);

        await PayAsync(cell, pharmacy, order.Id);
        await DispenseAsync(cell, pharmacy, order.Id);

        order = await PharmacySeed.OrderAsync(cell.Pharmacy, pharmacy);
        order.Status.Should().Be(PrescriptionStatus.Dispensed);
        order.PaymentStatus.Should().Be(PrescriptionPaymentStatus.Paid);
        (await cell.Billing.InvoiceForAsync(pharmacy, order.Id)).Status.Should().Be(InvoiceStatus.Paid);
        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task RefundedPharmacyPayment_BeforeDispensing_ReopensTheOrderAndBlocksDispensingUntilPaidAgain()
    {
        var (cell, pharmacy, order) = await AcceptedOrderAsync();
        await using var _ = cell;
        await PayAsync(cell, pharmacy, order.Id);
        var invoice = await cell.Billing.InvoiceForAsync(pharmacy, order.Id);

        await RefundAsync(cell, pharmacy, invoice.Id);

        order = await PharmacySeed.OrderAsync(cell.Pharmacy, pharmacy);
        order.PaymentStatus.Should().Be(PrescriptionPaymentStatus.AwaitingPayment);
        order.PaidAmount.Should().BeNull();
        order.PaidAt.Should().BeNull();
        order.PaymentReceiptNumber.Should().BeNull();
        order.PaymentReversedAmount.Should().Be(Quantity * UnitPrice);
        (await cell.Billing.InvoiceForAsync(pharmacy, order.Id)).Status.Should().Be(InvoiceStatus.Open);

        var blocked = () => DispenseAsync(cell, pharmacy, order.Id);
        await blocked.Should().ThrowAsync<Exception>("a refunded Prepaid order cannot be dispensed until it is paid again");

        await PayAsync(cell, pharmacy, order.Id);
        await DispenseAsync(cell, pharmacy, order.Id);

        (await PharmacySeed.OrderAsync(cell.Pharmacy, pharmacy)).Status.Should().Be(PrescriptionStatus.Dispensed);
        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task RefundedPharmacyPayment_AfterDispensing_IsRecordedAndNothingIsReopened()
    {
        var (cell, pharmacy, order) = await AcceptedOrderAsync();
        await using var _ = cell;
        await PayAsync(cell, pharmacy, order.Id);
        await DispenseAsync(cell, pharmacy, order.Id);
        var invoice = await cell.Billing.InvoiceForAsync(pharmacy, order.Id);

        await RefundAsync(cell, pharmacy, invoice.Id);

        order = await PharmacySeed.OrderAsync(cell.Pharmacy, pharmacy);
        order.Status.Should().Be(PrescriptionStatus.Dispensed, "medicine already handed over is not taken back");
        order.PaymentStatus.Should().Be(PrescriptionPaymentStatus.Refunded);
        order.PaymentReversedAmount.Should().Be(Quantity * UnitPrice);
        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
    }

    private static async Task<(TestCell Cell, Fac Pharmacy, PrescriptionOrder Order)> AcceptedOrderAsync()
    {
        var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a", "Metro Clinic"));
        var pharmacy = await cell.ProvisionAsync(Fac.Pharmacy("tenant-a", "Metro Pharmacy"));
        await PharmacySeed.StockAsync(cell.Pharmacy, pharmacy, Medicine, 100, UnitPrice);
        var patient = await ClinicSeed.PatientAsync(cell.Clinic, clinic, syncPatientId: null);
        var doctor = await ClinicSeed.DoctorAsync(cell.Clinic, clinic);
        var encounter = await ClinicSeed.EncounterWithPrescriptionAsync(cell.Clinic, clinic, patient, doctor, Medicine, Quantity);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new SignConsultationCommand(
            encounter.Id, TargetPharmacyFacilityId: pharmacy.FacilityId, TargetPharmacyTenantId: pharmacy.Tenant));
        await cell.PumpAsync();
        var order = await PharmacySeed.OrderAsync(cell.Pharmacy, pharmacy);
        await cell.Pharmacy.SendAsync(pharmacy.Tenant, pharmacy.Id, new AcceptPrescriptionCommand(order.Id));
        await cell.PumpAsync();
        return (cell, pharmacy, await PharmacySeed.OrderAsync(cell.Pharmacy, pharmacy));
    }

    private static async Task PayAsync(TestCell cell, Fac pharmacy, Guid orderId)
    {
        cell.Billing.SignIn(pharmacy.Tenant, pharmacy.FacilityId, StaffRole.Cashier);
        try
        {
            await cell.Billing.OpenShiftAsync();
            var invoice = await cell.Billing.InvoiceForAsync(pharmacy, orderId);
            await cell.Billing.PayAsync(invoice.Id, invoice.Total);
        }
        finally
        {
            cell.Billing.SignOut();
        }

        await cell.PumpAsync();
    }

    private static async Task RefundAsync(TestCell cell, Fac pharmacy, Guid invoiceId)
    {
        cell.Billing.SignIn(pharmacy.Tenant, pharmacy.FacilityId, StaffRole.Supervisor);
        try
        {
            await cell.Billing.OpenShiftAsync();
            await cell.Billing.RefundAsync(invoiceId, "Customer returned the prescription");
        }
        finally
        {
            cell.Billing.SignOut();
        }

        await cell.PumpAsync();
    }

    private static async Task DispenseAsync(TestCell cell, Fac pharmacy, Guid orderId)
    {
        await cell.Pharmacy.SendAsync(pharmacy.Tenant, pharmacy.Id, new DispensePrescriptionCommand(
            orderId, "Karen Reyes, RPh", "PRC-PHARM-88912", "OR-2026-0888", "Counseled"));
        await cell.PumpAsync();
    }
}
