using System;
using System.ComponentModel.DataAnnotations;

namespace ClinicEz.Clinic.Domain.Common;

/// <summary>
/// Universal multi-tenant base class for all clinic-scoped tables and child line-item entities.
/// Guarantees that every row possesses non-null tenant and clinic ownership for jurisdictional isolation.
/// </summary>
public abstract class ClinicScopedEntity : BaseEntity, IClinicScopedEntity
{
    protected ClinicScopedEntity() { }

    /// <summary>Organization or workspace tenant identifier.</summary>
    [Required]
    [MaxLength(64)]
    public string TenantId { get; set; } = string.Empty;

    /// <summary>Specific clinic facility identifier within the tenant.</summary>
    [Required]
    public Guid ClinicId { get; set; }
}

public interface IClinicScopedEntity : IEntity
{
    string TenantId { get; set; }
    Guid ClinicId { get; set; }
}
