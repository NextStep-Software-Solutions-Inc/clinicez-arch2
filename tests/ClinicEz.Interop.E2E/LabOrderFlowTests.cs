using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Laboratory.Application.Features.Requisitions.Commands;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using PatientDomain = ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Flow A: a clinic routes a lab order to a laboratory, the lab bills it through billing, the cashier pays, the lab
/// works and finalizes, and the result and every status change come back to the clinic and to the patient's app.
/// </summary>
public class LabOrderFlowTests
{
    [Fact]
    public Task SameTenant_RoutedOrder_FlowsFromOrderThroughPaymentToVerifiedResult() =>
        RunFullJourneyAsync(Fac.Clinic("tenant-a", "Metro Clinic"), Fac.Lab("tenant-a", "Metro Lab"), FacilityVisibility.Private, linked: false);

    [Fact]
    public Task CrossTenant_RoutedOrder_WithANetworkLabAndAnActiveLink_FlowsEndToEnd() =>
        RunFullJourneyAsync(Fac.Clinic("tenant-a", "Metro Clinic"), Fac.Lab("tenant-b", "Reference Lab"), FacilityVisibility.Network, linked: true);

    private static async Task RunFullJourneyAsync(Fac clinic, Fac lab, FacilityVisibility labVisibility, bool linked)
    {
        await using var cell = new TestCell();
        await cell.ProvisionAsync(clinic);
        await cell.ProvisionAsync(lab, labVisibility);
        if (linked) await cell.Hub.UpsertLinkAsync(clinic.Party, lab.Party, LinkScopes.LabOrder | LinkScopes.Result);

        await LabSeed.PriceAsync(cell.Lab, lab, LabOrderJourney.Test, LabOrderJourney.Price);
        var accountId = await PatientSeed.AccountAsync(cell.Patient);
        var patient = await ClinicSeed.PatientAsync(cell.Clinic, clinic, accountId);
        var doctor = await ClinicSeed.DoctorAsync(cell.Clinic, clinic);
        var journey = new LabOrderJourney(cell, clinic, lab);

        // 1. The doctor orders: the lab receives it, quotes it, and asks billing to invoice it.
        var order = await journey.OrderAsync(patient, doctor, lab);

        var requisition = await LabSeed.RequisitionAsync(cell.Lab, lab, order.Id);
        requisition.Stage.Should().Be(RequisitionStage.AwaitingPayment);
        requisition.PaymentPolicy.Should().Be(PaymentPolicy.Prepaid);
        requisition.QuotedAmount.Should().Be(LabOrderJourney.Price);
        requisition.OrderingTenantId.Should().Be(clinic.Tenant);
        requisition.OrderingFacilityId.Should().Be(clinic.FacilityId);
        requisition.PatientId.Should().Be(accountId, "the lab addresses its patient mirrors with the patient-app account id, not the clinic's chart id");
        requisition.ExternalRequisitionId.Should().Be(order.Id);

        var invoice = await cell.Billing.InvoiceForAsync(lab, requisition.Id);
        invoice.Total.Should().Be(LabOrderJourney.Price);
        invoice.Status.Should().Be(InvoiceStatus.Open);

        var clinicOrder = await journey.ClinicOrderAsync(order.Id);
        clinicOrder.Stage.Should().Be(LabOrderStage.AwaitingPayment);
        clinicOrder.PaymentRequired.Should().BeTrue();
        clinicOrder.QuotedAmount.Should().Be(LabOrderJourney.Price);
        clinicOrder.LaboratoryFacilityId.Should().Be(lab.FacilityId);
        clinicOrder.LaboratoryTenantId.Should().Be(lab.Tenant);

        (await PatientSlipAsync(cell, accountId, order.Id)).Stage.Should().Be(PatientDomain.LabSlipStage.AwaitingPayment);

        // 2. A prepaid order cannot be worked before the cashier has settled it.
        var tooEarly = () => cell.Lab.SendAsync(lab.Tenant, lab.Id, new AccessionSpecimenCommand(requisition.Id, "Phlebotomist Reyes", [new SpecimenAccessionInput()]));
        await tooEarly.Should().ThrowAsync<Exception>();

        // 3. The cashier takes the money: billing tells the lab, the lab tells the clinic and the patient.
        await journey.PayAtCashierAsync(requisition.Id);

        requisition = await LabSeed.RequisitionAsync(cell.Lab, lab, order.Id);
        requisition.Stage.Should().Be(RequisitionStage.Paid);
        requisition.PaidAtUtc.Should().NotBeNull();
        requisition.ReceiptNumber.Should().NotBeNullOrEmpty();
        requisition.InvoiceId.Should().Be(invoice.Id);
        (await cell.Billing.InvoiceForAsync(lab, requisition.Id)).Status.Should().Be(InvoiceStatus.Paid);
        (await journey.ClinicOrderAsync(order.Id)).Stage.Should().Be(LabOrderStage.Paid);
        (await PatientSlipAsync(cell, accountId, order.Id)).Stage.Should().Be(PatientDomain.LabSlipStage.Paid);

        // 4. The lab works and finalizes: the clinic gets a verified ClinicEZ-lab result, the patient the report.
        await journey.FinalizeAsync(requisition.Id);

        var finalized = await journey.ClinicOrderAsync(order.Id);
        finalized.Stage.Should().Be(LabOrderStage.ResultFinalized);
        var results = await journey.ClinicResultsAsync(order.Id);
        var result = results.Should().ContainSingle().Subject;
        result.Source.Should().Be(ResultSource.ClinicEzLab);
        result.Verification.Should().Be(VerificationState.Verified);
        result.ReportId.Should().NotBeNull();

        (await PatientSlipAsync(cell, accountId, order.Id)).Stage.Should().Be(PatientDomain.LabSlipStage.ResultFinalized);
        var reports = await cell.Patient.DbAsync(db => db.LabResultReports.IgnoreQueryFilters().Where(r => r.PatientId == accountId).ToListAsync());
        var report = reports.Should().ContainSingle().Subject;
        report.Source.Should().Be(PatientDomain.ResultProvenance.ClinicEzLab);
        report.Verification.Should().Be(PatientDomain.ResultVerification.Verified);
        report.RequisitionId.Should().Be(order.Id);

        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
    }

    private static Task<ClinicEz.Patient.Domain.Entities.LabRequestSlip> PatientSlipAsync(TestCell cell, Guid patientId, Guid requisitionId) =>
        cell.Patient.DbAsync(db => db.LabRequestSlips.IgnoreQueryFilters().SingleAsync(s => s.PatientId == patientId && s.RequisitionId == requisitionId));
}
