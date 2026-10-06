using System;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

[Table("Facilities", Schema = "main")]
public class FacilityLookupRecord
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public bool IsDeleted { get; set; }
}
