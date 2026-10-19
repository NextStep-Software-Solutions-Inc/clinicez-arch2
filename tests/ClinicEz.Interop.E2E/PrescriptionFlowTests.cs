using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using InvoiceStatus = ClinicEz.Billing.Domain.Enums.InvoiceStatus;
using PatientDomain = ClinicEz.Patient.Domain.Enums;
using StaffRole = ClinicEz.Billing.Domain.Enums.StaffRole;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Flow C: a clinic signs a prescription for a pharmacy, the pharmacy accepts and bills it, the cashier pays, the pharmacist
/// dispenses, and the clinic and the patient's app learn every step.
/// </summary>
public class PrescriptionFlowTests
{
    private const string Medicine = "Paracetamol";
    private const int Quantity = 10;
    private const decimal UnitPrice = 12m;

    [Fact]
    public Task SameTenant_Prescription_FlowsFromSigningThroughPaymentToDispensing() =>
        RunFullJourneyAsync(Fac.Clinic("tenant-a", "Metro Clinic"), Fac.Pharmacy("tenant-a", "Metro Pharmacy"), FacilityVisibility.Private, linked: false);

    [Fact]
    public Task CrossTenant_Prescription_ToANetworkPharmacyWithALink_FlowsEndToEnd() =>
        RunFullJourneyAsync(Fac.Clinic("tenant-a", "Metro Clinic"), Fac.Pharmacy("tenant-b", "Corner Pharmacy"), FacilityVisibility.Network, linked: true);

    private static async Task RunFullJourneyAsync(Fac clinic, Fac pharmacy, FacilityVisibility visibility, bool linked)
    {
        await using var cell = new TestCell();
        await cell.ProvisionAsync(clinic);
        await cell.ProvisionAsync(pharmacy, visibility);
        if (linked) await cell.Hub.UpsertLinkAsync(clinic.Party, pharmacy.Party, LinkScopes.Prescription);

        await PharmacySeed.StockAsync(cell.Pharmacy, pharmacy, Medicine, 100, UnitPrice);
        var accountId = await PatientSeed.AccountAsync(cell.Patient);
        var patient = await ClinicSeed.PatientAsync(cell.Clinic, clinic, accountId);
        var doctor = await ClinicSeed.DoctorAsync(cell.Clinic, clinic);
        var encounter = await ClinicSeed.EncounterWithPrescriptionAsync(cell.Clinic, clinic, patient, doctor, Medicine, Quantity);

        // 1. The doctor signs and sends the prescription to the pharmacy.
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new SignConsultationCommand(
            encounter.Id, TargetPharmacyFacilityId: pharmacy.FacilityId, TargetPharmacyTenantId: pharmacy.Tenant));
        await cell.PumpAsync();

        var order = await PharmacySeed.OrderAsync(cell.Pharmacy, pharmacy, encounter.Id);
        order.Status.Should().Be(PrescriptionStatus.Pending);
        order.OrderingTenantId.Should().Be(clinic.Tenant);
        order.OrderingFacilityId.Should().Be(clinic.FacilityId);
        order.PatientId.Should().Be(accountId, "the pharmacy addresses its patient mirrors with the patient-app account id, not the clinic's chart id");
        order.PaymentPolicy.Should().Be(PharmacyPaymentPolicy.Prepaid);

        // 2. The pharmacist accepts: the order is quoted from stock prices and billing is asked to invoice it.
        await cell.Pharmacy.SendAsync(pharmacy.Tenant, pharmacy.Id, new AcceptPrescriptionCommand(order.Id));
        await cell.PumpAsync();

        order = await PharmacySeed.OrderAsync(cell.Pharmacy, pharmacy, encounter.Id);
        order.Status.Should().Be(PrescriptionStatus.Accepted);
        order.PaymentStatus.Should().Be(PrescriptionPaymentStatus.AwaitingPayment);
        order.QuotedAmount.Should().Be(Quantity * UnitPrice);

        var invoice = await cell.Billing.InvoiceForAsync(pharmacy, order.Id);
        invoice.Total.Should().Be(Quantity * UnitPrice);
        invoice.Status.Should().Be(InvoiceStatus.Open);

        var clinicSide = await ClinicEncounterAsync(cell, encounter.Id);
        clinicSide.RxStage.Should().Be(RxStage.Accepted);
        clinicSide.RxQuotedAmount.Should().Be(Quantity * UnitPrice);
        clinicSide.RxPharmacyFacilityId.Should().Be(pharmacy.FacilityId);
        (await PatientRxAsync(cell, accountId, encounter.Id)).Stage.Should().Be(PatientDomain.PrescriptionStage.Accepted);

        // 3. A prepaid prescription cannot be dispensed before the cashier has settled it.
        var tooEarly = () => cell.Pharmacy.SendAsync(pharmacy.Tenant, pharmacy.Id, Dispense(order.Id));
        await tooEarly.Should().ThrowAsync<Exception>();

        // 4. The cashier takes the money.
        cell.Billing.SignIn(pharmacy.Tenant, pharmacy.FacilityId, StaffRole.Cashier);
        await cell.Billing.OpenShiftAsync();
        await cell.Billing.PayAsync(invoice.Id, invoice.Total);
        cell.Billing.SignOut();
        await cell.PumpAsync();

        order = await PharmacySeed.OrderAsync(cell.Pharmacy, pharmacy, encounter.Id);
        order.PaymentStatus.Should().Be(PrescriptionPaymentStatus.Paid);
        order.PaidAmount.Should().Be(Quantity * UnitPrice);
        order.PaymentReceiptNumber.Should().NotBeNullOrEmpty();

        // 5. The pharmacist dispenses: stock goes down, the clinic and the patient are told.
        await cell.Pharmacy.SendAsync(pharmacy.Tenant, pharmacy.Id, Dispense(order.Id));
        await cell.PumpAsync();

        order = await PharmacySeed.OrderAsync(cell.Pharmacy, pharmacy, encounter.Id);
        order.Status.Should().Be(PrescriptionStatus.Dispensed);
        var stock = await cell.Pharmacy.DbAsync(db => db.InventoryItems.IgnoreQueryFilters().SingleAsync(i => i.PharmacyId == pharmacy.FacilityId));
        stock.CurrentStock.Should().Be(100 - Quantity);

        clinicSide = await ClinicEncounterAsync(cell, encounter.Id);
        clinicSide.RxStage.Should().Be(RxStage.Dispensed);
        clinicSide.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.DispensedAtPartnerPharmacy);
        clinicSide.RxDispensedPharmacyName.Should().NotBeNullOrWhiteSpace();
        clinicSide.RxDispensedPharmacistName.Should().Be("Karen Reyes, RPh");
        clinicSide.RxDispensedAt.Should().NotBeNull();

        var document = await PatientRxAsync(cell, accountId, encounter.Id);
        document.Stage.Should().Be(PatientDomain.PrescriptionStage.Dispensed);
        document.DispensedAt.Should().NotBeNull();

        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
    }

    private static DispensePrescriptionCommand Dispense(Guid orderId) =>
        new(orderId, "Karen Reyes, RPh", "PRC-PHARM-88912", "OR-2026-0777", "Counseled");

    private static Task<ConsultationEncounter> ClinicEncounterAsync(TestCell cell, Guid encounterId) =>
        cell.Clinic.DbAsync(db => db.Consultations.IgnoreQueryFilters().SingleAsync(c => c.Id == encounterId));

    private static Task<ClinicEz.Patient.Domain.Entities.PrescriptionDocument> PatientRxAsync(TestCell cell, Guid patientId, Guid prescriptionId) =>
        cell.Patient.DbAsync(db => db.PrescriptionDocuments.IgnoreQueryFilters().SingleAsync(d => d.PatientId == patientId && d.PrescriptionId == prescriptionId));
}
