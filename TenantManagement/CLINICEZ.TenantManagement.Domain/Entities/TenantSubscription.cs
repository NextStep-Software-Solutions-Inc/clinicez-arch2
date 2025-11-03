using CLINICEZ.TenantManagement.Domain.Common;
using CLINICEZ.TenantManagement.Domain.Enums;
using Sieve.Attributes;
using System.Text.Json.Serialization;

namespace CLINICEZ.TenantManagement.Domain.Entities;

public class TenantSubscription : BaseEntity
{ 
    public TenantSubscription() { }
    [Sieve(CanFilter = true, CanSort = true)]
    public Guid TenantId { get; set; }
    [Sieve(CanFilter = true, CanSort = true)]
    public decimal Amount { get; set; }
    [Sieve(CanFilter = true, CanSort = true)]
    public Plan Plan { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public DateTime StartDate { get; set; }
    [Sieve(CanFilter = true, CanSort = true)]
    public DateTime EndDate { get; set; }
    [Sieve(CanFilter = true, CanSort = true)]
    public Status Status { get; set; }
    [Sieve(CanFilter = true, CanSort = true)]
    public BillingCycle BillingCycle { get; set; }
    [Sieve(CanFilter = true, CanSort = true)]
    public bool AutoRenew { get; set; } = true;
    [JsonIgnore]
    public virtual Tenant Tenant { get; set; } = null!;
}
