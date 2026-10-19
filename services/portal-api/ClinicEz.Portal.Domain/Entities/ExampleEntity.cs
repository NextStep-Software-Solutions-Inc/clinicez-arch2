using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

public class ExampleEntity : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
}