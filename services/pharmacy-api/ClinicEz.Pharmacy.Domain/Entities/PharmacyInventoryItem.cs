using System;
using System.Collections.Generic;
using ClinicEz.Pharmacy.Domain.Common;
using Sieve.Attributes;

namespace ClinicEz.Pharmacy.Domain.Entities;

public sealed class PharmacyInventoryItem : BaseEntity
{
    public PharmacyInventoryItem() { }

    [Sieve(CanFilter = true, CanSort = true)]
    public string TenantId { get; set; } = string.Empty;

    [Sieve(CanFilter = true, CanSort = true)]
    public string PharmacyId { get; set; } = string.Empty;

    [Sieve(CanFilter = true, CanSort = true)]
    public required string Sku { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public required string GenericName { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public string? BrandName { get; set; }

    public string DosageForm { get; set; } = "Tablet"; // Tablet, Capsule, Syrup, Susp, Injection

    public string Strength { get; set; } = string.Empty; // e.g., 5mg, 500mg, 625mg

    [Sieve(CanFilter = true, CanSort = true)]
    public int CurrentStock { get; set; }

    public int ReorderLevel { get; set; } = 100;

    public decimal UnitCost { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public decimal UnitPrice { get; set; }

    public string? StorageCondition { get; set; } = "Store at 20°C to 25°C";

    public bool IsDangerousDrug { get; set; } = false;

    public ICollection<InventoryBatch> Batches { get; set; } = new List<InventoryBatch>();
}
