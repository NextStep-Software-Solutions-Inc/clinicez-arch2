using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.E2E.Support;

/// <summary>Laboratory-side fixtures: what a lab's staff configure once its license has provisioned it.</summary>
public static class LabSeed
{
    /// <summary>Puts a priced test in the lab's catalogue; the lab bills an order line by matching its item code to the SKU.</summary>
    public static Task PriceAsync(LabHost lab, Fac facility, string sku, decimal price) => lab.DbAsync(async db =>
    {
        db.Products.Add(new Product { TenantId = facility.Tenant, LaboratoryId = facility.Id, Name = sku, Sku = sku, Price = price });
        await db.SaveChangesAsync();
        return 0;
    });

    public static Task SetPaymentPolicyAsync(LabHost lab, Fac facility, PaymentPolicy policy) => lab.DbAsync(async db =>
    {
        var settings = await db.LabSettings.IgnoreQueryFilters()
            .SingleAsync(s => s.TenantId == facility.Tenant && s.LaboratoryId == facility.Id);
        settings.PaymentPolicy = policy;
        await db.SaveChangesAsync();
        return 0;
    });

    public static Task<LabRequisition> RequisitionAsync(LabHost lab, Fac facility, Guid? clinicRequisitionId = null) => lab.DbAsync(db =>
    {
        var query = db.LabRequisitions.IgnoreQueryFilters()
            .Include(r => r.Specimens)
            .Include(r => r.AnalyteResults)
            .Include(r => r.DiagnosticReport)
            .Where(r => r.TenantId == facility.Tenant && r.LaboratoryId == facility.Id);
        if (clinicRequisitionId is { } id) query = query.Where(r => r.CorrelationId == id);
        return query.SingleAsync();
    });
}
