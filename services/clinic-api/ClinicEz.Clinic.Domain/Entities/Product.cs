using ClinicEz.Clinic.Domain.Common;
using Sieve.Attributes;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class Product : ClinicScopedEntity
{
    public Product() { }
    [Sieve(CanFilter = true, CanSort = true)]
    public required string Name { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public required string Sku { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public decimal Price { get; set; }
}


