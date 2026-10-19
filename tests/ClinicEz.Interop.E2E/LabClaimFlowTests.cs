using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Laboratory.Application.Features.Requisitions.Commands;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Flow B: a slip the patient carries has no target. Any ClinicEZ laboratory, of any tenant and with no link to the clinic,
/// can redeem its hub claim; the order then reaches that lab and its replies find their way back to the ordering clinic.
/// </summary>
public class LabClaimFlowTests
{
    [Fact]
    public async Task ClaimedSlip_IsWorkedByAnotherTenantsLab_AndTheResultReturnsToTheOrderingClinic()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a", "Metro Clinic"));
        var lab = await cell.ProvisionAsync(Fac.Lab("tenant-b", "Walk-in Lab"));
        await LabSeed.PriceAsync(cell.Lab, lab, LabOrderJourney.Test, LabOrderJourney.Price);
        var patient = await ClinicSeed.PatientAsync(cell.Clinic, clinic, syncPatientId: null);
        var doctor = await ClinicSeed.DoctorAsync(cell.Clinic, clinic);
        var journey = new LabOrderJourney(cell, clinic, lab);

        var order = await journey.OrderAsync(patient, doctor, target: null);

        order.ClaimToken.Should().NotBeNullOrWhiteSpace("an untargeted order becomes a QR slip");
        order.Stage.Should().Be(LabOrderStage.Issued);
        (await cell.Lab.DbAsync(db => db.LabRequisitions.IgnoreQueryFilters().CountAsync())).Should().Be(0, "nothing reaches a lab until the patient presents the slip");

        var claim = await cell.Lab.SendAsync(lab.Tenant, lab.Id, new ClaimLabOrderCommand(order.ClaimToken!));
        claim.CorrelationId.Should().Be(order.Id);
        await cell.PumpAsync();

        var requisition = await LabSeed.RequisitionAsync(cell.Lab, lab, order.Id);
        requisition.OrderingTenantId.Should().Be(clinic.Tenant);
        requisition.OrderingFacilityId.Should().Be(clinic.FacilityId);
        requisition.Stage.Should().Be(RequisitionStage.AwaitingPayment);
        requisition.QuotedAmount.Should().Be(LabOrderJourney.Price);

        var clinicOrder = await journey.ClinicOrderAsync(order.Id);
        clinicOrder.Stage.Should().Be(LabOrderStage.AwaitingPayment, "the claiming lab's status reaches the clinic although the two tenants have no link");
        clinicOrder.LaboratoryTenantId.Should().Be(lab.Tenant);
        clinicOrder.LaboratoryFacilityId.Should().Be(lab.FacilityId);

        await journey.PayAtCashierAsync(requisition.Id);
        await journey.FinalizeAsync(requisition.Id);

        (await journey.ClinicOrderAsync(order.Id)).Stage.Should().Be(LabOrderStage.ResultFinalized);
        var result = (await journey.ClinicResultsAsync(order.Id)).Should().ContainSingle().Subject;
        result.Source.Should().Be(ResultSource.ClinicEzLab);
        result.Verification.Should().Be(VerificationState.Verified);

        (await cell.Billing.InvoiceForAsync(lab, requisition.Id)).Status.Should().Be(InvoiceStatus.Paid);
        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task ClaimedSlip_CannotBeRedeemedTwice_AndASecondLabGetsNothing()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var lab = await cell.ProvisionAsync(Fac.Lab("tenant-b"));
        var patient = await ClinicSeed.PatientAsync(cell.Clinic, clinic, syncPatientId: null);
        var doctor = await ClinicSeed.DoctorAsync(cell.Clinic, clinic);
        var order = await new LabOrderJourney(cell, clinic, lab).OrderAsync(patient, doctor, target: null);

        await cell.Lab.SendAsync(lab.Tenant, lab.Id, new ClaimLabOrderCommand(order.ClaimToken!));
        await cell.PumpAsync();

        var again = () => cell.Lab.SendAsync(lab.Tenant, lab.Id, new ClaimLabOrderCommand(order.ClaimToken!));
        await again.Should().ThrowAsync<HubClaimException>();
        await cell.PumpAsync();

        (await cell.Lab.DbAsync(db => db.LabRequisitions.IgnoreQueryFilters().CountAsync())).Should().Be(1);
    }
}
