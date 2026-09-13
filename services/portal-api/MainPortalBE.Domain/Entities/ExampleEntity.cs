using MainPortalBE.Domain.Common;

namespace MainPortalBE.Domain.Entities;

public class ExampleEntity : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
}