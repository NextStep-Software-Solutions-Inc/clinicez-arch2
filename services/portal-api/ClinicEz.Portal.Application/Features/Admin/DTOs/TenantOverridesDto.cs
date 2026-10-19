using System;
using System.Collections.Generic;

namespace ClinicEz.Portal.Application.Features.Admin.DTOs;

public record TenantOverridesDto(
    Guid TenantId,
    Dictionary<string, long?> Limits,
    Dictionary<string, bool> Features,
    string? Reason,
    DateTime? UpdatedAt,
    string? TenantSlug = null,
    string? PlanSlug = null,
    string? PlanName = null,
    string? SubscriptionStatus = null,
    int EntitlementVersion = 0,
    Dictionary<string, long>? EffectiveLimits = null,
    List<string>? EffectiveFeatures = null
);

public class UpdateTenantOverridesRequest
{
    public Dictionary<string, long?> Limits { get; set; } = new(StringComparer.Ordinal);
    public Dictionary<string, bool> Features { get; set; } = new(StringComparer.Ordinal);
    public string? Reason { get; set; }
}
