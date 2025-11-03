using CLINICEZ.TenantManagement.Domain.Common;
using Sieve.Attributes;
using System.Text.Json.Serialization;

namespace CLINICEZ.TenantManagement.Domain.Entities;

public class TenantSetting : BaseEntity
{
    public TenantSetting() { }
    [Sieve(CanFilter = true, CanSort = true)]
    public Guid TenantId { get; set; }
    [Sieve(CanFilter = true, CanSort = true)]
    public bool OnPremise { get; set; }
    public string BaseURL { get; set; } = string.Empty;
    public string DbConnectionString { get; set; } = string.Empty;
    public string BillingContactEmail {  get; set; } = string.Empty;
    [JsonIgnore]
    public virtual Tenant Tenant { get; set; } = null!;
}
