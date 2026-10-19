using ClinicEz.Interop.E2E.Support;
using ClinicEz.Laboratory.Application.Features.Requisitions.Commands;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using InvoiceStatus = ClinicEz.Billing.Domain.Enums.InvoiceStatus;
using StaffRole = ClinicEz.Billing.Domain.Enums.StaffRole;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Flow F: a supervisor corrects money at the billing desk. The facility that asked for the invoice is told, takes the
/// order back to "awaiting payment" when work has not started, asks billing again under the same request id (which
/// reopens the same invoice), and the order can be paid again.
/// </summary>
public class BillingCorrectionFlowTests
{
    [Fact]
    public async Task VoidedLabInvoice_IsReopenedForTheSameOrder_AndCanBePaidAgain()
    {
        var (cell, lab, journey, order) = await OrderedAsync();
        await using var _ = cell;
        var requisition = await LabSeed.RequisitionAsync(cell.Lab, lab, order.Id);
        var invoice = await cell.Billing.InvoiceForAsync(lab, requisition.Id);

        cell.Billing.SignIn(lab.Tenant, lab.FacilityId, StaffRole.Supervisor);
        await cell.Billing.VoidAsync(invoice.Id, "Ordered by mistake");
        cell.Billing.SignOut();
        await cell.PumpAsync();

        requisition = await LabSeed.RequisitionAsync(cell.Lab, lab, order.Id);
        requisition.PaymentCorrection.Should().Be(PaymentCorrection.Voided);
        requisition.Stage.Should().Be(RequisitionStage.AwaitingPayment);
        var reopened = await cell.Billing.InvoiceForAsync(lab, requisition.Id);
        reopened.Id.Should().Be(invoice.Id, "billing reopens the corrected invoice instead of creating a second one");
        reopened.Status.Should().Be(InvoiceStatus.Open);

        await journey.PayAtCashierAsync(requisition.Id);

        (await LabSeed.RequisitionAsync(cell.Lab, lab, order.Id)).Stage.Should().Be(RequisitionStage.Paid);
        (await journey.ClinicOrderAsync(order.Id)).Stage.Should().Be(LabOrderStage.Paid);
        (await cell.Billing.InvoiceForAsync(lab, requisition.Id)).Status.Should().Be(InvoiceStatus.Paid);
        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task RefundedLabPayment_BeforeAnyWork_ReopensTheOrderAndBlocksTheWorkUntilPaidAgain()
    {
        var (cell, lab, journey, order) = await OrderedAsync();
        await using var _ = cell;
        var requisition = await LabSeed.RequisitionAsync(cell.Lab, lab, order.Id);
        await journey.PayAtCashierAsync(requisition.Id);
        var invoice = await cell.Billing.InvoiceForAsync(lab, requisition.Id);

        await RefundAsync(cell, lab, invoice.Id);

        requisition = await LabSeed.RequisitionAsync(cell.Lab, lab, order.Id);
        requisition.PaymentCorrection.Should().Be(PaymentCorrection.Refunded);
        requisition.Stage.Should().Be(RequisitionStage.AwaitingPayment);
        requisition.PaidAtUtc.Should().BeNull();
        (await journey.ClinicOrderAsync(order.Id)).Stage.Should().Be(LabOrderStage.AwaitingPayment);
        (await cell.Billing.InvoiceForAsync(lab, requisition.Id)).Status.Should().Be(InvoiceStatus.Open);

        var blocked = () => cell.Lab.SendAsync(lab.Tenant, lab.Id, new AccessionSpecimenCommand(requisition.Id, "Phlebotomist Reyes", [new SpecimenAccessionInput()]));
        await blocked.Should().ThrowAsync<Exception>();

        await journey.PayAtCashierAsync(requisition.Id);
        await journey.FinalizeAsync(requisition.Id);

        (await journey.ClinicOrderAsync(order.Id)).Stage.Should().Be(LabOrderStage.ResultFinalized);
        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task RefundedLabPayment_AfterTheSpecimenIsDrawn_IsRecordedButTheWorkContinues()
    {
        var (cell, lab, journey, order) = await OrderedAsync();
        await using var _ = cell;
        var requisition = await LabSeed.RequisitionAsync(cell.Lab, lab, order.Id);
        await journey.PayAtCashierAsync(requisition.Id);
        await cell.Lab.SendAsync(lab.Tenant, lab.Id, new AccessionSpecimenCommand(requisition.Id, "Phlebotomist Reyes", [new SpecimenAccessionInput()]));
        await cell.PumpAsync();
        var invoice = await cell.Billing.InvoiceForAsync(lab, requisition.Id);

        await RefundAsync(cell, lab, invoice.Id);

        requisition = await LabSeed.RequisitionAsync(cell.Lab, lab, order.Id);
        requisition.PaymentCorrection.Should().Be(PaymentCorrection.Refunded);
        requisition.Stage.Should().Be(RequisitionStage.SpecimenCollected, "a drawn specimen is not un-drawn");
        requisition.PaidAtUtc.Should().NotBeNull();
        (await journey.ClinicOrderAsync(order.Id)).Stage.Should().Be(LabOrderStage.SpecimenCollected);
    }

    private static async Task RefundAsync(TestCell cell, Fac facility, Guid invoiceId)
    {
        cell.Billing.SignIn(facility.Tenant, facility.FacilityId, StaffRole.Supervisor);
        try
        {
            await cell.Billing.OpenShiftAsync();
            await cell.Billing.RefundAsync(invoiceId, "Patient left before the draw");
        }
        finally
        {
            cell.Billing.SignOut();
        }

        await cell.PumpAsync();
    }

    private static async Task<(TestCell Cell, Fac Lab, LabOrderJourney Journey, ClinicEz.Clinic.Application.Features.LabOrders.DTOs.ClinicLabOrderDto Order)> OrderedAsync()
    {
        var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var lab = await cell.ProvisionAsync(Fac.Lab("tenant-a"));
        await LabSeed.PriceAsync(cell.Lab, lab, LabOrderJourney.Test, LabOrderJourney.Price);
        var patient = await ClinicSeed.PatientAsync(cell.Clinic, clinic, syncPatientId: null);
        var doctor = await ClinicSeed.DoctorAsync(cell.Clinic, clinic);
        var journey = new LabOrderJourney(cell, clinic, lab);
        return (cell, lab, journey, await journey.OrderAsync(patient, doctor, lab));
    }
}
