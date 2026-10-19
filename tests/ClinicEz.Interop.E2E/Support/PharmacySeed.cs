using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.E2E.Support;

/// <summary>Pharmacy-side fixtures: stock a pharmacist would already have received.</summary>
public static class PharmacySeed
{
    public static Task StockAsync(PharmacyHost pharmacy, Fac facility, string genericName, int quantity, decimal unitPrice) => pharmacy.DbAsync(async db =>
    {
        db.InventoryItems.Add(new PharmacyInventoryItem
        {
            Id = Guid.NewGuid(),
            TenantId = facility.Tenant,
            PharmacyId = facility.FacilityId,
            Sku = $"SKU-{genericName.ToUpperInvariant()}",
            GenericName = genericName,
            DosageForm = "Tablet",
            Strength = "500mg",
            CurrentStock = quantity,
            UnitPrice = unitPrice,
            Batches =
            [
                new InventoryBatch
                {
                    Id = Guid.NewGuid(),
                    TenantId = facility.Tenant,
                    PharmacyId = facility.FacilityId,
                    BatchNumber = $"B-{genericName.ToUpperInvariant()}-1",
                    ExpiryDate = DateTime.UtcNow.AddMonths(10),
                    QuantityRemaining = quantity,
                    Status = BatchStatus.Active
                }
            ]
        });
        await db.SaveChangesAsync();
        return 0;
    });

    public static Task<PrescriptionOrder> OrderAsync(PharmacyHost pharmacy, Fac facility, Guid? externalPrescriptionId = null) => pharmacy.DbAsync(db =>
    {
        var query = db.PrescriptionOrders.IgnoreQueryFilters()
            .Include(o => o.Items)
            .Where(o => o.TenantId == facility.Tenant && o.PharmacyId == facility.FacilityId);
        if (externalPrescriptionId is { } id) query = query.Where(o => o.ExternalPrescriptionId == id);
        return query.SingleAsync();
    });
}
