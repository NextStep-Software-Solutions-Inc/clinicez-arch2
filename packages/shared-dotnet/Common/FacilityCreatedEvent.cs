using System;
using System.Collections.Generic;
using ClinicEz.Shared.Licensing;

namespace ClinicEz.Shared.Common;

public record FacilityProviderDto(
    Guid Id,
    string Name,
    string Specialty,
    string? ProfessionalLicenseNo = null,
    bool IsActive = true,
    int DisplayOrder = 0);

public record ClinicServiceDto(
    Guid ServiceId,
    string Name,
    string Category,
    decimal StandardPrice,
    bool IsActive = true);

public record FacilityCreatedEvent
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string TenantId { get; init; } = string.Empty;
    public string? TenantSlug { get; init; }
    public FacilityType FacilityType { get; init; }
    public Guid ResourceId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Slug { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    // Cryptographically signed license information rooted upon facility activation
    public string? LicenseToken { get; init; }
    public FacilityLimits? Limits { get; init; }
    public string? PlanTier { get; init; }
    public DateTime? LicenseExpiresAt { get; init; }

    public string? ConsoleUrl { get; init; }

    // Synchronized public directory metadata & clinical providers (populated on FacilityDirectoryUpdated)
    public string? Address { get; init; }
    public string? City { get; init; }
    public string? Province { get; init; }
    public string? Region { get; init; }
    public string? ContactNumber { get; init; }
    public string? ContactEmail { get; init; }
    public string? OperatingHours { get; init; }
    public string? Classification { get; init; }
    public bool? IsPhilHealthAccredited { get; init; }
    public bool? IsPublic { get; init; }
    public bool? IsWorkspaceEligible { get; init; }
    public bool? IsDirectoryPublished { get; init; }
    public IReadOnlyList<FacilityProviderDto>? Providers { get; init; }
    public IReadOnlyList<ClinicServiceDto>? Services { get; init; }
    public bool? IsBookingPaused { get; init; }
    public bool? IsJoinGated { get; init; }
    public string? JoinCode { get; init; }

    // Central Workspace Branch baseline (non-secret metadata propagated from Portal)
    public Guid? BranchId { get; init; }
    public string? BranchName { get; init; }
    public string? BranchPhilHealthAccreditationNumber { get; init; }
    public string? BranchPmccNumber { get; init; }
    public string? BranchSoftwareCertificateId { get; init; }
    public string? BranchKonsultaEndpoint { get; init; }
    public bool IsBranchPhilHealthAccredited { get; init; } = false;
}

