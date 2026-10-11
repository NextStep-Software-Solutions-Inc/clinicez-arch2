using ClinicEz.Interop.E2E.Support;
using ClinicEz.Laboratory.Application.Features.Requisitions.Commands;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StaffRole = ClinicEz.Billing.Domain.Enums.StaffRole;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Flow H: two tenants that happen to use identical order and accession numbers share the same servers and must never see,
/// pay or work each other's orders.
/// </summary>
public class TenantIsolationTests
{
    [Fact]
    public async Task TwoTenants_WithIdenticalOrderNumbers_NeverCrossEachOther()
    {
        await using var cell = new TestCell();
        var clinicA = await cell.ProvisionAsync(Fac.Clinic("tenant-a", "Clinic A"));
        var clinicB = await cell.ProvisionAsync(Fac.Clinic("tenant-b", "Clinic B"));
        var labA = await cell.ProvisionAsync(Fac.Lab("tenant-a", "Lab A"));
        var labB = await cell.ProvisionAsync(Fac.Lab("tenant-b", "Lab B"));
        await LabSeed.PriceAsync(cell.Lab, labA, LabOrderJourney.Test, 350m);
        await LabSeed.PriceAsync(cell.Lab, labB, LabOrderJourney.Test, 500m);
        var journeyA = new LabOrderJourney(cell, clinicA, labA);
        var journeyB = new LabOrderJourney(cell, clinicB, labB);

        var orderA = await journeyA.OrderAsync(
            await ClinicSeed.PatientAsync(cell.Clinic, clinicA, syncPatientId: null), await ClinicSeed.DoctorAsync(cell.Clinic, clinicA), labA);
        var orderB = await journeyB.OrderAsync(
            await ClinicSeed.PatientAsync(cell.Clinic, clinicB, syncPatientId: null), await ClinicSeed.DoctorAsync(cell.Clinic, clinicB), labB);

        orderA.OrderNumber.Should().Be(orderB.OrderNumber, "each clinic numbers its own orders from 001");
        var requisitionA = await LabSeed.RequisitionAsync(cell.Lab, labA, orderA.Id);
        var requisitionB = await LabSeed.RequisitionAsync(cell.Lab, labB, orderB.Id);
        requisitionA.AccessionNumber.Should().Be(requisitionB.AccessionNumber);
        requisitionA.Id.Should().NotBe(requisitionB.Id);
        requisitionA.OrderingTenantId.Should().Be("tenant-a");
        requisitionB.OrderingTenantId.Should().Be("tenant-b");
        requisitionA.QuotedAmount.Should().Be(350m);
        requisitionB.QuotedAmount.Should().Be(500m);

        // Each service only exposes its own tenant's rows to its staff.
        (await cell.Lab.AsStaffAsync(labA.Tenant, labA.Id, sp => CountAsync(sp.GetRequiredService<ClinicEz.Laboratory.Infrastructure.Persistence.ApplicationDbContext>().LabRequisitions))).Should().Be(1);
        (await cell.Clinic.AsStaffAsync(clinicB.Tenant, clinicB.Id, sp => CountAsync(sp.GetRequiredService<ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext>().LabOrders))).Should().Be(1);
        var crossWork = () => cell.Lab.SendAsync(labA.Tenant, labA.Id, new AccessionSpecimenCommand(requisitionB.Id, "Phlebotomist Reyes", [new SpecimenAccessionInput()]));
        await crossWork.Should().ThrowAsync<KeyNotFoundException>("lab A cannot even see lab B's requisition");

        // Paying tenant A's invoice settles tenant A only.
        var invoiceA = await cell.Billing.InvoiceForAsync(labA, requisitionA.Id);
        var invoiceB = await cell.Billing.InvoiceForAsync(labB, requisitionB.Id);
        invoiceA.Total.Should().Be(350m);
        invoiceB.Total.Should().Be(500m);

        cell.Billing.SignIn(labB.Tenant, labB.FacilityId, StaffRole.Cashier);
        await cell.Billing.OpenShiftAsync();
        var crossPay = () => cell.Billing.PayAsync(invoiceA.Id, invoiceA.Total);
        await crossPay.Should().ThrowAsync<Exception>("a cashier of tenant B cannot take payment on tenant A's invoice");
        cell.Billing.SignOut();

        await journeyA.PayAtCashierAsync(requisitionA.Id);

        (await LabSeed.RequisitionAsync(cell.Lab, labA, orderA.Id)).Stage.Should().Be(RequisitionStage.Paid);
        (await LabSeed.RequisitionAsync(cell.Lab, labB, orderB.Id)).Stage.Should().Be(RequisitionStage.AwaitingPayment);
        (await journeyA.ClinicOrderAsync(orderA.Id)).Stage.Should().Be(LabOrderStage.Paid);
        (await journeyB.ClinicOrderAsync(orderB.Id)).Stage.Should().Be(LabOrderStage.AwaitingPayment);

        // Finishing tenant A's work delivers a result to clinic A and to nobody else.
        await journeyA.FinalizeAsync(requisitionA.Id);

        (await journeyA.ClinicResultsAsync(orderA.Id)).Should().ContainSingle();
        (await journeyB.ClinicResultsAsync(orderB.Id)).Should().BeEmpty();
        (await cell.Clinic.DbAsync(db => db.LabResults.IgnoreQueryFilters().CountAsync())).Should().Be(1);
        (await journeyB.ClinicOrderAsync(orderB.Id)).Stage.Should().Be(LabOrderStage.AwaitingPayment);
        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
    }

    private static async Task<int> CountAsync<T>(DbSet<T> set) where T : class => await set.CountAsync();
}
