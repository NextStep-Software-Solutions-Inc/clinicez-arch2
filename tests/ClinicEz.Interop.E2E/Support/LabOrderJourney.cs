using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Laboratory.Application.Features.Analytes.Commands;
using ClinicEz.Laboratory.Application.Features.Reports.Commands;
using ClinicEz.Laboratory.Application.Features.Requisitions.Commands;
using ClinicEz.Billing.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.E2E.Support;

/// <summary>The lab-order journey, one step per thing a person does; every step is followed by the whole cell settling.</summary>
public sealed class LabOrderJourney(TestCell cell, Fac clinic, Fac lab)
{
    public const string Test = "CBC";

    public const decimal Price = 350m;

    public Fac Clinic { get; } = clinic;

    public Fac Lab { get; } = lab;

    /// <summary>Doctor orders a test; the clinic issues it to <paramref name="target"/> (or onto a claim slip when null).</summary>
    public async Task<ClinicLabOrderDto> OrderAsync(ClinicEz.Clinic.Domain.Entities.Patient patient, StaffMember doctor, Fac? target)
    {
        var order = await cell.Clinic.SendAsync(Clinic.Tenant, Clinic.Id, new CreateClinicLabOrderCommand(
            patient.Id,
            $"{patient.FirstName} {patient.LastName}",
            OrderedByDoctorId: doctor.Id,
            OrderedByDoctorName: "Dr. Ana Cruz",
            ClinicalDiagnosis: "Fever",
            Items: [new CreateLabOrderItemRequest(Test, "Hematology", null)],
            TargetFacilityId: target?.FacilityId,
            TargetTenantId: target?.Tenant));
        await cell.PumpAsync();
        return order;
    }

    public Task<LabOrder> ClinicOrderAsync(Guid orderId) => cell.Clinic.DbAsync(db =>
        db.LabOrders.IgnoreQueryFilters().Include(o => o.Items).SingleAsync(o => o.Id == orderId));

    public Task<List<LabResult>> ClinicResultsAsync(Guid orderId) => cell.Clinic.DbAsync(db =>
        db.LabResults.IgnoreQueryFilters().Where(r => r.LabOrderId == orderId).ToListAsync());

    /// <summary>The cashier of the lab's billing desk settles the invoice the lab requested, in full.</summary>
    public async Task PayAtCashierAsync(Guid requisitionId, Fac? facility = null)
    {
        var desk = facility ?? Lab;
        cell.Billing.SignIn(desk.Tenant, desk.FacilityId, StaffRole.Cashier);
        try
        {
            await cell.Billing.OpenShiftAsync();
            var invoice = await cell.Billing.InvoiceForAsync(desk, requisitionId);
            await cell.Billing.PayAsync(invoice.Id, invoice.Total);
        }
        finally
        {
            cell.Billing.SignOut();
        }

        await cell.PumpAsync();
    }

    /// <summary>Phlebotomist collects, med tech enters results, pathologist signs: the lab finalizes the report.</summary>
    public async Task FinalizeAsync(Guid requisitionId, Fac? facility = null)
    {
        var lab = facility ?? Lab;
        await cell.Lab.SendAsync(lab.Tenant, lab.Id, new AccessionSpecimenCommand(requisitionId, "Phlebotomist Reyes", [new SpecimenAccessionInput()]));
        await cell.Lab.SendAsync(lab.Tenant, lab.Id, new RecordAnalyteResultCommand(
            requisitionId, "MedTech Lopez", [new AnalyteResultInput { AnalyteCode = "WBC", Value = "7.5", Unit = "x10^9/L" }]));
        await cell.Lab.SendAsync(lab.Tenant, lab.Id, new VerifyAndSignReportCommand(
            requisitionId, "Dr. Pat Ologist", "PRC-7654321", "MedTech Lopez", "PRC-1234567", "Normal"));
        await cell.PumpAsync();
    }
}
