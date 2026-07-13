using LaboratoryDashboardBE.Domain.Common;
using Sieve.Attributes;

namespace LaboratoryDashboardBE.Domain.Entities;

public sealed class Product : BaseEntity
{
    public Product() { }
    [Sieve(CanFilter = true, CanSort = true)]
    public required string Name { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public required string Sku { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public decimal Price { get; set; }
}



