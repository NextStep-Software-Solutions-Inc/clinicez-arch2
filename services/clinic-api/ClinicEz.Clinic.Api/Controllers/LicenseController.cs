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

    public LicenseController(
        IRepository<ClinicSettings> settingsRepo,
        IRepository<StaffMember> staffRepo,
        IFacilityLicenseValidator licenseValidator,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork)
    {
        _settingsRepo = settingsRepo;
        _staffRepo = staffRepo;
        _licenseValidator = licenseValidator;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
    }

    [HttpGet]
    [AllowAnonymous] // Facility bootup check does not require prior authentication
    public async Task<ActionResult<ApiResponse<FacilityLicenseStatusDto>>> GetLicenseStatus(CancellationToken ct)
    {
        var targetTenantId = _clinicContext.TenantId;
        var targetClinicId = _clinicContext.ClinicId;
        var dummyDefaultId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        ClinicSettings? settings = null;

        // 1. If explicit non-dummy ClinicId was requested in headers
        if (targetClinicId != Guid.Empty && targetClinicId != dummyDefaultId)
        {
            settings = await _settingsRepo.IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.ClinicId == targetClinicId && !s.IsDeleted, ct);
        }

        // 2. If TenantId was provided (subdomain, query param, or header), match settings by TenantId
        if (settings == null && !string.IsNullOrWhiteSpace(targetTenantId) && targetTenantId != "tenant_default")
        {
            settings = await _settingsRepo.IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.TenantId.ToLower() == targetTenantId.ToLower() && !s.IsDeleted, ct);
        }

        // 3. Fallback to default or first settings row
        if (settings == null)
        {
            settings = await _settingsRepo.Query(s => s.ClinicId == targetClinicId)
                .FirstOrDefaultAsync(ct) ?? await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        }

        var resolvedClinicId = settings?.ClinicId ?? targetClinicId;
        var resolvedTenantId = settings?.TenantId ?? targetTenantId;

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
            settings?.ClinicName ?? "Clinic Facility",
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
        var targetTenantId = !string.IsNullOrWhiteSpace(payload?.TenantId)
            ? payload.TenantId
            : _clinicContext.TenantId;

        // Tenant binding verification: If the request explicitly specified a tenant context (subdomain/header),
        // ensure the token belongs to that tenant to prevent accidental or unauthorized cross-tenant license reuse.
        if (!string.IsNullOrWhiteSpace(_clinicContext.TenantId) &&
            _clinicContext.TenantId != "tenant_default" &&
            !string.IsNullOrWhiteSpace(payload?.TenantId) &&
            !string.Equals(_clinicContext.TenantId, payload.TenantId, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(ApiResponse<FacilityLicenseStatusDto>.Fail(
                $"License tenant mismatch: This license key was issued for tenant '{payload.TenantId}', but you are activating workspace '{_clinicContext.TenantId}'."));
        }

        var settings = await _settingsRepo.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.ClinicId == targetClinicId && !s.IsDeleted, ct)
            ?? await _settingsRepo.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.TenantId.ToLower() == targetTenantId.ToLower() && !s.IsDeleted, ct);

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
