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
        var settings = await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(ct);

        var activeStaffCount = await _staffRepo.Query(s => s.ClinicId == _clinicContext.ClinicId && s.IsActive)
            .CountAsync(ct);

        var validation = _licenseValidator.Validate(settings?.LicenseToken, _clinicContext.ClinicId, _clinicContext.TenantId);

        string status;
        if (validation.IsMissing) status = "ActivationRequired";
        else if (validation.IsTampered) status = "Tampered";
        else if (validation.IsExpired) status = "Expired";
        else status = "Active";

        var limits = validation.Payload?.Limits ?? PlanTierDefaults.GetLimitsForTier(settings?.PlanTier ?? "Community");
        var features = validation.Payload?.EnabledFeatures ?? PlanTierDefaults.GetFeaturesForTier(settings?.PlanTier ?? "Community");

        var dto = new FacilityLicenseStatusDto(
            status,
            _clinicContext.ClinicId,
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
    public async Task<ActionResult<ApiResponse<FacilityLicenseStatusDto>>> ApplyLicense(
        [FromBody] ApplyLicenseRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request?.LicenseToken))
        {
            return BadRequest(ApiResponse<FacilityLicenseStatusDto>.Fail("License token is required."));
        }

        var validation = _licenseValidator.Validate(request.LicenseToken.Trim(), _clinicContext.ClinicId, _clinicContext.TenantId);
        if (!validation.IsValid && !validation.IsExpired)
        {
            return BadRequest(ApiResponse<FacilityLicenseStatusDto>.Fail(validation.ErrorMessage ?? "Invalid or tampered facility license key."));
        }

        var settings = await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(ct);

        if (settings == null)
        {
            settings = new ClinicSettings
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                ClinicName = validation.Payload?.FacilityName ?? "Clinic Facility",
                LicenseToken = request.LicenseToken.Trim(),
                PlanTier = validation.Payload?.PlanTier ?? "Community",
                MaxStaffLimit = validation.Payload?.Limits?.MaxStaff ?? 5,
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
            settings.LicenseExpiresAt = validation.Payload?.ExpiresAtUtc;
        }

        await _unitOfWork.SaveChangesAsync(ct);

        var activeStaffCount = await _staffRepo.Query(s => s.ClinicId == _clinicContext.ClinicId && s.IsActive)
            .CountAsync(ct);

        var status = validation.IsExpired ? "Expired" : "Active";

        var dto = new FacilityLicenseStatusDto(
            status,
            _clinicContext.ClinicId,
            settings.ClinicName,
            validation.Payload?.PlanTier ?? settings.PlanTier,
            validation.Payload?.Limits ?? PlanTierDefaults.GetLimitsForTier(settings.PlanTier),
            activeStaffCount,
            validation.Payload?.EnabledFeatures ?? PlanTierDefaults.GetFeaturesForTier(settings.PlanTier),
            validation.Payload?.ExpiresAtUtc,
            false,
            validation.ErrorMessage);

        return Ok(ApiResponse<FacilityLicenseStatusDto>.Success(dto, "Facility license successfully applied and verified."));
    }
}
