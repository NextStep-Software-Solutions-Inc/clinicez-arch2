using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Licensing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Api.Controllers;

public record ApplyLabLicenseRequest(string LicenseToken);

public record LabLicenseStatusDto(
    string Status, // "Active", "ActivationRequired", "Expired", "Tampered"
    Guid LaboratoryId,
    string LaboratoryName,
    string PlanTier,
    FacilityLimits Limits,
    int ActiveStaffCount,
    System.Collections.Generic.List<string> EnabledFeatures,
    DateTime? ExpiresAtUtc,
    bool IsTampered,
    string? ErrorMessage);

[ApiController]
[Route("api/v1/laboratory/license")]
public sealed class LicenseController : ControllerBase
{
    private readonly IRepository<LabSettings> _settingsRepo;
    private readonly IRepository<LabStaffMember> _staffRepo;
    private readonly IFacilityLicenseValidator _licenseValidator;
    private readonly IUnitOfWork _unitOfWork;

    public LicenseController(
        IRepository<LabSettings> settingsRepo,
        IRepository<LabStaffMember> staffRepo,
        IFacilityLicenseValidator licenseValidator,
        IUnitOfWork unitOfWork)
    {
        _settingsRepo = settingsRepo;
        _staffRepo = staffRepo;
        _licenseValidator = licenseValidator;
        _unitOfWork = unitOfWork;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<LabLicenseStatusDto>>> GetLicenseStatus(
        [FromHeader(Name = "X-Facility-Id")] Guid? facilityId,
        [FromHeader(Name = "X-Tenant-Id")] string? tenantId,
        CancellationToken ct)
    {
        var targetLabId = facilityId ?? Guid.Empty;
        var settings = await _settingsRepo.FindAsync(s => s.LaboratoryId == targetLabId, ct);

        var activeStaffCount = await _staffRepo.Query(s => s.LaboratoryId == targetLabId && s.IsActive)
            .CountAsync(ct);

        var validation = _licenseValidator.Validate(settings?.LicenseToken, targetLabId, tenantId ?? settings?.TenantId);

        string status;
        if (validation.IsMissing) status = "ActivationRequired";
        else if (validation.IsTampered) status = "Tampered";
        else if (validation.IsExpired) status = "Expired";
        else status = "Active";

        var limits = validation.Payload?.Limits ?? PlanTierDefaults.GetLimitsForTier(settings?.PlanTier ?? "Community");
        var features = validation.Payload?.EnabledFeatures ?? PlanTierDefaults.GetFeaturesForTier(settings?.PlanTier ?? "Community");

        var dto = new LabLicenseStatusDto(
            status,
            targetLabId,
            settings?.LaboratoryName ?? "Laboratory Facility",
            validation.Payload?.PlanTier ?? settings?.PlanTier ?? "Community",
            limits,
            activeStaffCount,
            features,
            validation.Payload?.ExpiresAtUtc ?? settings?.LicenseExpiresAt,
            validation.IsTampered,
            validation.ErrorMessage);

        return Ok(ApiResponse<LabLicenseStatusDto>.Success(dto));
    }

    [HttpPost("apply")]
    public async Task<ActionResult<ApiResponse<LabLicenseStatusDto>>> ApplyLicense(
        [FromHeader(Name = "X-Facility-Id")] Guid? facilityId,
        [FromHeader(Name = "X-Tenant-Id")] string? tenantId,
        [FromBody] ApplyLabLicenseRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request?.LicenseToken))
        {
            return BadRequest(ApiResponse<LabLicenseStatusDto>.Fail("License token is required."));
        }

        var targetLabId = facilityId ?? Guid.Empty;
        var targetTenantId = tenantId ?? string.Empty;

        var validation = _licenseValidator.Validate(request.LicenseToken.Trim(), targetLabId, targetTenantId);
        if (!validation.IsValid && !validation.IsExpired)
        {
            return BadRequest(ApiResponse<LabLicenseStatusDto>.Fail(validation.ErrorMessage ?? "Invalid or tampered laboratory license key."));
        }

        var settings = await _settingsRepo.FindAsync(s => s.LaboratoryId == targetLabId, ct);

        if (settings == null)
        {
            settings = new LabSettings
            {
                Id = Guid.NewGuid(),
                TenantId = !string.IsNullOrWhiteSpace(targetTenantId) ? targetTenantId : (validation.Payload?.TenantId ?? "default"),
                LaboratoryId = targetLabId != Guid.Empty ? targetLabId : (validation.Payload?.FacilityId ?? Guid.NewGuid()),
                LaboratoryName = validation.Payload?.FacilityName ?? "Laboratory Facility",
                LicenseToken = request.LicenseToken.Trim(),
                PlanTier = validation.Payload?.PlanTier ?? "Community",
                MaxStaffLimit = validation.Payload?.Limits?.MaxStaff ?? 5,
                MaxAnalyzersLimit = validation.Payload?.Limits?.MaxAnalyzers ?? 1,
                LicenseExpiresAt = validation.Payload?.ExpiresAtUtc,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "LicenseActivation"
            };
            await _settingsRepo.AddAsync(settings, ct);
        }
        else
        {
            settings.LicenseToken = request.LicenseToken.Trim();
            settings.PlanTier = validation.Payload?.PlanTier ?? "Community";
            settings.MaxStaffLimit = validation.Payload?.Limits?.MaxStaff ?? 5;
            settings.MaxAnalyzersLimit = validation.Payload?.Limits?.MaxAnalyzers ?? 1;
            settings.LicenseExpiresAt = validation.Payload?.ExpiresAtUtc;
        }

        await _unitOfWork.SaveChangesAsync(ct);

        var activeStaffCount = await _staffRepo.Query(s => s.LaboratoryId == settings.LaboratoryId && s.IsActive)
            .CountAsync(ct);

        var status = validation.IsExpired ? "Expired" : "Active";

        var dto = new LabLicenseStatusDto(
            status,
            settings.LaboratoryId,
            settings.LaboratoryName,
            validation.Payload?.PlanTier ?? settings.PlanTier,
            validation.Payload?.Limits ?? PlanTierDefaults.GetLimitsForTier(settings.PlanTier),
            activeStaffCount,
            validation.Payload?.EnabledFeatures ?? PlanTierDefaults.GetFeaturesForTier(settings.PlanTier),
            validation.Payload?.ExpiresAtUtc,
            false,
            validation.ErrorMessage);

        return Ok(ApiResponse<LabLicenseStatusDto>.Success(dto, "Laboratory facility license successfully applied and verified."));
    }
}
