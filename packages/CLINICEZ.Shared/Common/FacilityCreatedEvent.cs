using System;

namespace CLINICEZ.Shared.Common;

public record FacilityCreatedEvent
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string TenantId { get; init; } = string.Empty;
    public FacilityType FacilityType { get; init; }
    public Guid ResourceId { get; init; }
    public string Name { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}
