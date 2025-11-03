using CLINICEZ.TenantManagement.Domain.Common;
using Sieve.Attributes;

namespace CLINICEZ.TenantManagement.Domain.Entities;

public class Tenant : BaseEntity
{
    public Tenant() { }
    [Sieve(CanFilter = true, CanSort = true)]
    public string Name { get; set; } = string.Empty;
    [Sieve(CanFilter = true, CanSort = true)]
    public string? Description { get; set; }
    [Sieve(CanFilter = true, CanSort = true)]
    public virtual List<Module> Modules { get; set; } = [];
    public virtual TenantSetting TenantSetting { get; set; } = null!;
    public virtual List<TenantSubscription> TenantSubscriptions { get; set; } = [];
    public virtual List<TenantMember> TenantMembers { get; set; } = [];

}
