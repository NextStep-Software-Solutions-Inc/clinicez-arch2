using System;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

[Table("Tenants", Schema = "main")]
public class TenantLookupRecord
{
    public Guid Id { get; set; }
    public string TenantSlug { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsDeleted { get; set; }
}
