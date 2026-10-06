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
        var targetTenantId = _clinicContext.TenantId;
        var targetClinicId = _clinicContext.ClinicId;
        var dummyDefaultId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        ClinicSettings? settings = null;
        TenantLookupDto? tenantInfo = null;

        // 1. If TenantId was provided (subdomain, query param, or header) and it is not tenant_default
        if (!string.IsNullOrWhiteSpace(targetTenantId) && !string.Equals(targetTenantId, "tenant_default", StringComparison.OrdinalIgnoreCase))
        {
            tenantInfo = await _tenantLookup.LookupAsync(targetTenantId, ct);
            if (tenantInfo == null)
            {
                return NotFound(ApiResponse<FacilityLicenseStatusDto>.Fail(
                    $"Workspace '{targetTenantId}' was not found. Please verify the subdomain or register your workspace."));
            }

            var tenantGuidStr = tenantInfo.Id.ToString().ToLowerInvariant();
            var tenantSlugStr = tenantInfo.Slug.ToLowerInvariant();
            var rawTenantStr = targetTenantId.ToLowerInvariant();

            settings = await _settingsRepo.IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => !s.IsDeleted && (
                    s.TenantId.ToLower() == tenantGuidStr ||
                    s.TenantId.ToLower() == tenantSlugStr ||
                    s.TenantId.ToLower() == rawTenantStr ||
                    (targetClinicId != Guid.Empty && targetClinicId != dummyDefaultId && s.ClinicId == targetClinicId)
                ), ct);

            // If tenant is known but facility has not yet activated a license, return activation required
            if (settings == null)
            {
                var defaultLimits = PlanTierDefaults.GetLimitsForTier("Community");
                var defaultFeatures = PlanTierDefaults.GetFeaturesForTier("Community");
                var unactivatedDto = new FacilityLicenseStatusDto(
                    "ActivationRequired",
                    Guid.Empty,
                    tenantInfo.Name,
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
        else
        {
            // Fallback for single-tenant / on-premise default flow
            if (targetClinicId != Guid.Empty && targetClinicId != dummyDefaultId)
            {
                settings = await _settingsRepo.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(s => s.ClinicId == targetClinicId && !s.IsDeleted, ct);
            }

            if (settings == null)
            {
                settings = await _settingsRepo.Query(s => s.ClinicId == targetClinicId)
                    .FirstOrDefaultAsync(ct) ?? await _settingsRepo.Query().FirstOrDefaultAsync(ct);
            }
        }

        var resolvedClinicId = settings?.ClinicId ?? targetClinicId;
        var resolvedTenantId = settings?.TenantId ?? (tenantInfo?.Id.ToString() ?? targetTenantId);

        var activeStaffCount = await _staffRepo.Query(s => s.ClinicId == resolvedClinicId && s.IsActive)
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
            settings?.ClinicName ?? (tenantInfo?.Name ?? "Clinic Facility"),
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
        var targetClinicId = payload?.FacilityId != null && payload.FacilityId != Guid.Empty
            ? payload.FacilityId
            : _clinicContext.ClinicId;

        // Tenant binding verification: If the request explicitly specified a tenant context (subdomain/header),
        // ensure the token belongs to that tenant to prevent accidental or unauthorized cross-tenant license reuse.
        var contextTenant = _clinicContext.TenantId;
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
            : contextTenant;

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

            settings = await _settingsRepo.IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => !s.IsDeleted && (
                    s.TenantId.ToLower() == tenantIdStr ||
                    (tenantSlugStr != null && s.TenantId.ToLower() == tenantSlugStr) ||
                    (contextTenantStr != null && s.TenantId.ToLower() == contextTenantStr)
                ), ct);
        }

        if (settings == null)
        {
            settings = new ClinicSettings
            {
                Id = Guid.NewGuid(),
                TenantId = targetTenantId,
                ClinicId = targetClinicId,
                ClinicName = payload?.FacilityName ?? "Clinic Facility",
                LicenseToken = request.LicenseToken.Trim(),
                PlanTier = payload?.PlanTier ?? "Community",
                MaxStaffLimit = payload?.Limits?.MaxStaff ?? 5,
                LicenseExpiresAt = payload?.ExpiresAtUtc,
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
            if (!string.IsNullOrWhiteSpace(payload?.FacilityName))
            {
                settings.ClinicName = payload.FacilityName;
            }
            settings.PlanTier = payload?.PlanTier ?? "Community";
            settings.MaxStaffLimit = payload?.Limits?.MaxStaff ?? 5;
            settings.LicenseExpiresAt = payload?.ExpiresAtUtc;
        }

        await _unitOfWork.SaveChangesAsync(ct);

        var activeStaffCount = await _staffRepo.Query(s => s.ClinicId == targetClinicId && s.IsActive)
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
