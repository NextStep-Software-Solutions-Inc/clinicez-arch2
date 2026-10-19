using System;
using ClinicEz.Pharmacy.Domain.Common;
using ClinicEz.Pharmacy.Domain.Enums;
using Sieve.Attributes;

namespace ClinicEz.Pharmacy.Domain.Entities;

public sealed class InventoryBatch : BaseEntity
{
    public InventoryBatch() { }

    [Sieve(CanFilter = true, CanSort = true)]
    public string TenantId { get; set; } = string.Empty;

    public string PharmacyId { get; set; } = string.Empty;

    [Sieve(CanFilter = true, CanSort = true)]
    public Guid InventoryItemId { get; set; }
    public PharmacyInventoryItem? InventoryItem { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public required string BatchNumber { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public DateTime ExpiryDate { get; set; }

    public int QuantityReceived { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public int QuantityRemaining { get; set; }

    public DateTime ReceivedDate { get; set; } = DateTime.UtcNow;

    [Sieve(CanFilter = true, CanSort = true)]
    public BatchStatus Status { get; set; } = BatchStatus.Active;
}
