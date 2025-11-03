using CLINICEZ.TenantManagement.Domain.Common;
using Sieve.Attributes;
using System.Text.Json.Serialization;

namespace CLINICEZ.TenantManagement.Domain.Entities;

public class Module : BaseEntity
{
    public Module() { }
    [Sieve(CanFilter = true, CanSort = true)]
    public string Key { get; set; } = string.Empty;
    [Sieve(CanFilter = true, CanSort = true)]
    public string Name { get; set; } = string.Empty;

    [Sieve(CanFilter = true, CanSort = true)]
    public string? Description { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public bool IsActive { get; set; }
    [JsonIgnore]
    public virtual List<Tenant> Tenants { get; set; } = null!;
}
