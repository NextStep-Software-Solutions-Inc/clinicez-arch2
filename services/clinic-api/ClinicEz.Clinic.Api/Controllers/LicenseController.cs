using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Licensing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Api.Controllers;

public record ApplyLicenseRequest(string LicenseToken);

public record FacilityLicenseStatusDto(
    string Status, // "Active", "ActivationRequired", "Expired", "Tampered"
    Guid ClinicId,
    string ClinicName,
    string PlanTier,
    FacilityLimits Limits,
    int ActiveStaffCount,
    System.Collections.Generic.List<string> EnabledFeatures,
    DateTime? ExpiresAtUtc,
    bool IsTampered,
    string? ErrorMessage);

[ApiController]
[Route("api/v1/clinic/license")]
[Route("api/v1/license")]
public sealed class LicenseController : ControllerBase
{
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IFacilityLicenseValidator _licenseValidator;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITenantLookupService _tenantLookup;

    public LicenseController(
        IRepository<ClinicSettings> settingsRepo,
        IRepository<StaffMember> staffRepo,
        IFacilityLicenseValidator licenseValidator,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        ITenantLookupService tenantLookup)
    {
        _settingsRepo = settingsRepo;
        _staffRepo = staffRepo;
        _licenseValidator = licenseValidator;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _tenantLookup = tenantLookup;
    }

    [HttpGet]
    [AllowAnonymous] // Facility bootup check does not require prior authentication
    public async Task<ActionResult<ApiResponse<FacilityLicenseStatusDto>>> GetLicenseStatus(CancellationToken ct)
    {
        var dummyDefaultId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        var req = HttpContext?.Request;
        var facilitySlugHeader = req?.Headers.TryGetValue("X-Facility-Slug", out var fVal) == true && !string.IsNullOrWhiteSpace(fVal)
            ? fVal.ToString().Trim()
            : (req?.Query.TryGetValue("facilitySlug", out var qf) == true && !string.IsNullOrWhiteSpace(qf) ? qf.ToString().Trim() : null);

        var tenantSlugHeader = req?.Headers.TryGetValue("X-Tenant-Id", out var tVal) == true && !string.IsNullOrWhiteSpace(tVal)
            ? tVal.ToString().Trim()
            : (req?.Query.TryGetValue("tenant", out var qt) == true && !string.IsNullOrWhiteSpace(qt) ? qt.ToString().Trim() : null);

        var clinicIdHeader = req?.Headers.TryGetValue("X-Clinic-Id", out var cVal) == true && Guid.TryParse(cVal.ToString(), out var parsedCId)
            ? parsedCId
            : (req?.Query.TryGetValue("facilityId", out var qId) == true && Guid.TryParse(qId.ToString(), out var parsedQId) ? parsedQId : _clinicContext.ClinicId);

        var effectiveTenantId = !string.IsNullOrWhiteSpace(tenantSlugHeader)
            ? tenantSlugHeader
            : _clinicContext.TenantId;

        ClinicSettings? settings = null;
        TenantLookupDto? lookupInfo = null;

        // 1. Direct Facility Resolution (Strict: clinic slug is never interchangeable with tenant slug)
        if (!string.IsNullOrWhiteSpace(facilitySlugHeader))
        {
            lookupInfo = await _tenantLookup.LookupFacilityAsync(facilitySlugHeader, ct) ?? await _tenantLookup.LookupAsync(facilitySlugHeader, ct);
            if (lookupInfo == null)
            {
                return NotFound(ApiResponse<FacilityLicenseStatusDto>.Fail(
                    $"Facility '{facilitySlugHeader}' was not found. Please verify the subdomain or register your facility in the Portal."));
            }

            var facilityId = lookupInfo.FacilityId ?? Guid.Empty;
            if (facilityId != Guid.Empty)
            {
                settings = await _settingsRepo.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(s => !s.IsDeleted && s.ClinicId == facilityId, ct);
            }

            // If facility is registered in portal/main db but has not yet activated its local settings:
            if (settings == null)
            {
                var defaultLimits = PlanTierDefaults.GetLimitsForTier("Community");
                var defaultFeatures = PlanTierDefaults.GetFeaturesForTier("Community");
                var unactivatedDto = new FacilityLicenseStatusDto(
                    "ActivationRequired",
                    facilityId,
                    lookupInfo.Name,
                    "Community",
                    defaultLimits,
                    0,
                    defaultFeatures,
                    null,
                    false,
                    null);

                return Ok(ApiResponse<FacilityLicenseStatusDto>.Success(unactivatedDto));
            }
        }
        // 2. Tenant Workspace Resolution
        else if (!string.IsNullOrWhiteSpace(effectiveTenantId) && !string.Equals(effectiveTenantId, "tenant_default", StringComparison.OrdinalIgnoreCase))
        {
            lookupInfo = await _tenantLookup.LookupAsync(effectiveTenantId, ct);
            if (lookupInfo == null)
            {
                return NotFound(ApiResponse<FacilityLicenseStatusDto>.Fail(
                    $"Workspace '{effectiveTenantId}' was not found. Please verify the subdomain or register your workspace."));
            }

            var tenantGuidStr = lookupInfo.Id.ToString().ToLowerInvariant();
            var tenantSlugStr = lookupInfo.Slug.ToLowerInvariant();
            var rawTenantStr = effectiveTenantId.ToLowerInvariant();

            if (lookupInfo.FacilityId.HasValue && lookupInfo.FacilityId.Value != Guid.Empty)
            {
                // When looking up a specific facility (e.g. clinic-b), match strictly by its ClinicId
                settings = await _settingsRepo.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(s => !s.IsDeleted && s.ClinicId == lookupInfo.FacilityId.Value, ct);
            }
            else
            {
                if (clinicIdHeader != Guid.Empty && clinicIdHeader != dummyDefaultId)
                {
                    settings = await _settingsRepo.IgnoreQueryFilters()
                        .FirstOrDefaultAsync(s => !s.IsDeleted && s.ClinicId == clinicIdHeader &&
                            (s.TenantId.ToLower() == tenantGuidStr || s.TenantId.ToLower() == tenantSlugStr || s.TenantId.ToLower() == rawTenantStr), ct);
                }

                if (settings == null)
                {
                    var matches = await _settingsRepo.IgnoreQueryFilters()
                        .Where(s => !s.IsDeleted && (
                            s.TenantId.ToLower() == tenantGuidStr ||
                            s.TenantId.ToLower() == tenantSlugStr ||
                            s.TenantId.ToLower() == rawTenantStr
                        ))
                        .Take(2)
                        .ToListAsync(ct);
                    settings = matches.Count == 1 ? matches[0] : null;
                }
            }

            if (settings == null)
            {
                var defaultLimits = PlanTierDefaults.GetLimitsForTier("Community");
                var defaultFeatures = PlanTierDefaults.GetFeaturesForTier("Community");
                var unactivatedDto = new FacilityLicenseStatusDto(
                    "ActivationRequired",
                    lookupInfo.FacilityId ?? (clinicIdHeader != dummyDefaultId ? clinicIdHeader : Guid.Empty),
                    lookupInfo.Name,
                    "Community",
                    defaultLimits,
                    0,
                    defaultFeatures,
                    null,
                    false,
                    null);

                return Ok(ApiResponse<FacilityLicenseStatusDto>.Success(unactivatedDto));
            }
        }
        // 3. Fallback for single-tenant / on-premise default flow
        else
        {
            if (clinicIdHeader != Guid.Empty && clinicIdHeader != dummyDefaultId)
            {
                settings = await _settingsRepo.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(s => s.ClinicId == clinicIdHeader && !s.IsDeleted, ct);
            }

            if (settings == null)
            {
                var candidates = await _settingsRepo.IgnoreQueryFilters()
                    .Where(s => !s.IsDeleted)
                    .Take(2)
                    .ToListAsync(ct);
                settings = candidates.Count == 1 ? candidates[0] : null;
            }
        }

        var resolvedClinicId = settings?.ClinicId ?? (lookupInfo?.FacilityId ?? clinicIdHeader);
        var resolvedTenantId = settings?.TenantId ?? (lookupInfo?.Id.ToString() ?? effectiveTenantId ?? _clinicContext.TenantId);

        var activeStaffCount = await _staffRepo.IgnoreQueryFilters()
            .Where(s => s.ClinicId == resolvedClinicId && s.IsActive && !s.IsDeleted)
            .CountAsync(ct);

        var validation = _licenseValidator.Validate(settings?.LicenseToken, resolvedClinicId, resolvedTenantId);

        string status;
        if (validation.IsMissing) status = "ActivationRequired";
        else if (validation.IsTampered) status = "Tampered";
        else if (validation.IsExpired) status = "Expired";
        else status = "Active";

        var limits = validation.Payload?.Limits ?? PlanTierDefaults.GetLimitsForTier(settings?.PlanTier ?? "Community");
        var features = validation.Payload?.EnabledFeatures ?? PlanTierDefaults.GetFeaturesForTier(settings?.PlanTier ?? "Community");

        var dto = new FacilityLicenseStatusDto(
            status,
            resolvedClinicId,
            settings?.ClinicName ?? (lookupInfo?.Name ?? "Clinic Facility"),
            validation.Payload?.PlanTier ?? settings?.PlanTier ?? "Community",
            limits,
            activeStaffCount,
            features,
            validation.Payload?.ExpiresAtUtc ?? settings?.LicenseExpiresAt,
            validation.IsTampered,
            validation.ErrorMessage);

        return Ok(ApiResponse<FacilityLicenseStatusDto>.Success(dto));
    }

    [HttpPost("apply")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<FacilityLicenseStatusDto>>> ApplyLicense(
        [FromBody] ApplyLicenseRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request?.LicenseToken))
        {
            return BadRequest(ApiResponse<FacilityLicenseStatusDto>.Fail("License token is required."));
        }

        // Validate cryptographic signature without binding expected IDs (Guid.Empty allows token to declare its FacilityId and TenantId)
        var validation = _licenseValidator.Validate(request.LicenseToken.Trim(), Guid.Empty, null);
        if (!validation.IsValid && !validation.IsExpired)
        {
            return BadRequest(ApiResponse<FacilityLicenseStatusDto>.Fail(validation.ErrorMessage ?? "Invalid or tampered facility license key."));
        }

        var payload = validation.Payload;

        var req = HttpContext?.Request;
        var facilitySlugHeader = req?.Headers.TryGetValue("X-Facility-Slug", out var fVal) == true && !string.IsNullOrWhiteSpace(fVal)
            ? fVal.ToString().Trim()
            : (req?.Query.TryGetValue("facilitySlug", out var qf) == true && !string.IsNullOrWhiteSpace(qf) ? qf.ToString().Trim() : null);

        var tenantSlugHeader = req?.Headers.TryGetValue("X-Tenant-Id", out var tVal) == true && !string.IsNullOrWhiteSpace(tVal)
            ? tVal.ToString().Trim()
            : (req?.Query.TryGetValue("tenant", out var qt) == true && !string.IsNullOrWhiteSpace(qt) ? qt.ToString().Trim() : null);

        TenantLookupDto? facilityLookup = null;
        if (!string.IsNullOrWhiteSpace(facilitySlugHeader))
        {
            facilityLookup = await _tenantLookup.LookupFacilityAsync(facilitySlugHeader, ct) ?? await _tenantLookup.LookupAsync(facilitySlugHeader, ct);
            if (facilityLookup != null &&
                payload?.FacilityId != null && payload.FacilityId != Guid.Empty &&
                facilityLookup.FacilityId.HasValue && facilityLookup.FacilityId.Value != Guid.Empty &&
                payload.FacilityId != facilityLookup.FacilityId.Value)
            {
                return BadRequest(ApiResponse<FacilityLicenseStatusDto>.Fail(
                    $"License facility mismatch: This license key was issued for '{payload.FacilityName ?? "another facility"}', but you are activating facility '{facilityLookup.Name}'."));
            }
        }

        var targetClinicId = payload?.FacilityId != null && payload.FacilityId != Guid.Empty
            ? payload.FacilityId
            : (facilityLookup?.FacilityId ?? _clinicContext.ClinicId);

        // Tenant binding verification: If the request explicitly specified a tenant context (subdomain/header),
        // ensure the token belongs to that tenant to prevent accidental or unauthorized cross-tenant license reuse.
        var contextTenant = !string.IsNullOrWhiteSpace(tenantSlugHeader) && !string.Equals(tenantSlugHeader, "tenant_default", StringComparison.OrdinalIgnoreCase)
            ? tenantSlugHeader
            : _clinicContext.TenantId;

        if (!string.IsNullOrWhiteSpace(contextTenant) &&
            !string.Equals(contextTenant, "tenant_default", StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(payload?.TenantId))
        {
            bool isDirectMatch = string.Equals(contextTenant, payload.TenantId, StringComparison.OrdinalIgnoreCase);
            bool isSlugMatch = !string.IsNullOrWhiteSpace(payload.TenantSlug) &&
                               string.Equals(contextTenant, payload.TenantSlug, StringComparison.OrdinalIgnoreCase);

            if (!isDirectMatch && !isSlugMatch)
            {
                var tenantLookup = await _tenantLookup.LookupAsync(contextTenant, ct);
                if (tenantLookup == null || !string.Equals(tenantLookup.Id.ToString(), payload.TenantId, StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest(ApiResponse<FacilityLicenseStatusDto>.Fail(
                        $"License tenant mismatch: This license key was issued for tenant '{payload.TenantId}', but you are activating workspace '{contextTenant}'."));
                }
            }
        }

        var targetTenantId = !string.IsNullOrWhiteSpace(payload?.TenantId)
            ? payload.TenantId
            : (facilityLookup?.Id.ToString() ?? contextTenant);

        var dummyDefaultId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        ClinicSettings? settings = null;
        if (targetClinicId != Guid.Empty && targetClinicId != dummyDefaultId)
        {
            settings = await _settingsRepo.IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.ClinicId == targetClinicId && !s.IsDeleted, ct);
        }

        if (settings == null && !string.IsNullOrWhiteSpace(targetTenantId))
        {
            var tenantIdStr = targetTenantId.ToLowerInvariant();
            var tenantSlugStr = payload?.TenantSlug?.ToLowerInvariant();
            var contextTenantStr = contextTenant?.ToLowerInvariant();

            // Only adopt an uninitialized placeholder row (dummyDefaultId or Guid.Empty), never a real sibling clinic
            settings = await _settingsRepo.IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => !s.IsDeleted &&
                    (s.ClinicId == Guid.Empty || s.ClinicId == dummyDefaultId) && (
                    s.TenantId.ToLower() == tenantIdStr ||
                    (tenantSlugStr != null && s.TenantId.ToLower() == tenantSlugStr) ||
                    (contextTenantStr != null && s.TenantId.ToLower() == contextTenantStr)
                ), ct);
        }

        var targetClinicName = payload?.FacilityName ?? facilityLookup?.Name ?? "Clinic Facility";

        // The workspace lookup is served from these local rows, so remember the slugs the facility is activated under.
        var facilitySlug = !string.IsNullOrWhiteSpace(facilitySlugHeader) && !Guid.TryParse(facilitySlugHeader, out _)
            ? facilitySlugHeader.ToLowerInvariant()
            : facilityLookup?.FacilitySlug;
        var tenantSlug = payload?.TenantSlug;

        if (settings == null)
        {
            settings = new ClinicSettings
            {
                Id = Guid.NewGuid(),
                TenantId = targetTenantId,
                ClinicId = targetClinicId,
                TenantSlug = tenantSlug,
                FacilitySlug = facilitySlug,
                ClinicName = targetClinicName,
                LicenseToken = request.LicenseToken.Trim(),
                PlanTier = payload?.PlanTier ?? "Community",
                MaxStaffLimit = payload?.Limits?.MaxStaff ?? 5,
                LicenseExpiresAt = payload?.ExpiresAtUtc,
                EntitlementVersion = payload?.EntitlementVersion ?? 0,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "LicenseActivation"
            };
            await _settingsRepo.AddAsync(settings, ct);
        }
        else
        {
            settings.LicenseToken = request.LicenseToken.Trim();
            settings.ClinicId = targetClinicId;
            settings.TenantId = targetTenantId;
            settings.TenantSlug = tenantSlug ?? settings.TenantSlug;
            settings.FacilitySlug = facilitySlug ?? settings.FacilitySlug;
            settings.ClinicName = targetClinicName;
            settings.PlanTier = payload?.PlanTier ?? "Community";
            settings.MaxStaffLimit = payload?.Limits?.MaxStaff ?? 5;
            settings.LicenseExpiresAt = payload?.ExpiresAtUtc;
            settings.EntitlementVersion = payload?.EntitlementVersion ?? 0;
        }

        await _unitOfWork.SaveChangesAsync(ct);

        var activeStaffCount = await _staffRepo.IgnoreQueryFilters()
            .Where(s => s.ClinicId == targetClinicId && s.IsActive && !s.IsDeleted)
            .CountAsync(ct);

        var status = validation.IsExpired ? "Expired" : "Active";
        var limits = payload?.Limits ?? PlanTierDefaults.GetLimitsForTier(settings.PlanTier);
        var features = payload?.EnabledFeatures ?? PlanTierDefaults.GetFeaturesForTier(settings.PlanTier);

        var dto = new FacilityLicenseStatusDto(
            status,
            targetClinicId,
            settings.ClinicName,
            payload?.PlanTier ?? settings.PlanTier,
            limits,
            activeStaffCount,
            features,
            payload?.ExpiresAtUtc ?? settings.LicenseExpiresAt,
            validation.IsTampered,
            validation.ErrorMessage);

        return Ok(ApiResponse<FacilityLicenseStatusDto>.Success(dto, "Facility license successfully applied and verified."));
    }
}
