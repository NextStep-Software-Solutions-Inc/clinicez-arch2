using System;

namespace CLINICEZ.Shared.Common;

public record FacilityProvisionedEvent
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid ResourceId { get; init; }
    public string TenantId { get; init; } = string.Empty;
    public bool Success { get; init; } = true;
    public string Message { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}
