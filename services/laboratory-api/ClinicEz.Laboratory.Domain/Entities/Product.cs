using System;
using ClinicEz.Laboratory.Domain.Common;
using Sieve.Attributes;

namespace ClinicEz.Laboratory.Domain.Entities;

public sealed class Product : BaseEntity, ILabScopedEntity
{
    public Product() { }

    /// <summary>Owning laboratory; stamped from the active data scope when the product is created.</summary>
    public string TenantId { get; set; } = string.Empty;

    public Guid LaboratoryId { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public required string Name { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public required string Sku { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public decimal Price { get; set; }
}



