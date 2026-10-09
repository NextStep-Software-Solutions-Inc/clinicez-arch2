using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Licensing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Api.Controllers;

public record ApplyPharmacyLicenseRequest(string LicenseToken);

public record PharmacyLicenseStatusDto(
    string Status, // "Active", "ActivationRequired", "Expired", "Tampered"
    Guid PharmacyId,
    string PharmacyName,
    string PlanTier,
    FacilityLimits Limits,
    int ActiveStaffCount,
    System.Collections.Generic.List<string> EnabledFeatures,
    DateTime? ExpiresAtUtc,
    bool IsTampered,
    string? ErrorMessage,
    bool IsReadOnlyGrace = false,
    DateTime? ReadOnlyGraceUntilUtc = null);

[ApiController]
[Route("api/v1/pharmacy/license")]
[Route("api/v1/license")]
public sealed class LicenseController : ControllerBase
{
    private readonly IRepository<PharmacySettings> _settingsRepo;
    private readonly IRepository<PharmacyStaffMember> _staffRepo;
    private readonly IFacilityLicenseValidator _licenseValidator;
    private readonly IUnitOfWork _unitOfWork;

    public LicenseController(
        IRepository<PharmacySettings> settingsRepo,
        IRepository<PharmacyStaffMember> staffRepo,
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
    public async Task<ActionResult<ApiResponse<PharmacyLicenseStatusDto>>> GetLicenseStatus(
        [FromHeader(Name = "X-Facility-Id")] Guid? facilityId,
        [FromHeader(Name = "X-Tenant-Id")] string? tenantId,
        CancellationToken ct)
    {
        var settings = await FindSettingsAsync(facilityId, ct);

        var targetPharmacyId = facilityId ?? settings?.PharmacyId ?? Guid.Empty;

        var activeStaffCount = await CountActiveStaffAsync(targetPharmacyId, ct);

        var validation = _licenseValidator.Validate(settings?.LicenseToken, targetPharmacyId, tenantId ?? settings?.TenantId);

        string status;
        if (validation.IsMissing) status = "ActivationRequired";
        else if (validation.IsTampered) status = "Tampered";
        else if (validation.IsExpired) status = "Expired";
        else status = "Active";

        var limits = validation.Payload?.Limits ?? PlanTierDefaults.GetLimitsForTier(settings?.PlanTier ?? "Community");
        var features = validation.Payload?.EnabledFeatures ?? PlanTierDefaults.GetFeaturesForTier(settings?.PlanTier ?? "Community");

        var dto = new PharmacyLicenseStatusDto(
            status,
            targetPharmacyId,
            settings?.PharmacyName ?? "Pharmacy Facility",
            validation.Payload?.PlanTier ?? settings?.PlanTier ?? "Community",
            limits,
            activeStaffCount,
            features,
            validation.Payload?.ExpiresAtUtc ?? settings?.LicenseExpiresAt,
            validation.IsTampered,
            validation.ErrorMessage,
            validation.IsReadOnlyGrace,
            validation.ReadOnlyGraceUntilUtc);

        return Ok(ApiResponse<PharmacyLicenseStatusDto>.Success(dto));
    }

    [HttpPost("apply")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<PharmacyLicenseStatusDto>>> ApplyLicense(
        [FromHeader(Name = "X-Facility-Id")] Guid? facilityId,
        [FromHeader(Name = "X-Tenant-Id")] string? tenantId,
        [FromBody] ApplyPharmacyLicenseRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request?.LicenseToken))
        {
            return BadRequest(ApiResponse<PharmacyLicenseStatusDto>.Fail("License token is required."));
        }

        var targetPharmacyId = facilityId ?? Guid.Empty;
        var targetTenantId = tenantId ?? string.Empty;

        var validation = _licenseValidator.Validate(request.LicenseToken.Trim(), targetPharmacyId, targetTenantId);
        if (!validation.IsValid && !validation.IsExpired)
        {
            return BadRequest(ApiResponse<PharmacyLicenseStatusDto>.Fail(validation.ErrorMessage ?? "Invalid or tampered pharmacy license key."));
        }

        var resolvedPharmacyId = targetPharmacyId != Guid.Empty ? targetPharmacyId : (validation.Payload?.FacilityId ?? Guid.Empty);

        var settings = await FindSettingsAsync(resolvedPharmacyId, ct);

        if (settings == null)
        {
            settings = new PharmacySettings
            {
                Id = Guid.NewGuid(),
                TenantId = !string.IsNullOrWhiteSpace(targetTenantId) ? targetTenantId : (validation.Payload?.TenantId ?? "default"),
                PharmacyId = targetPharmacyId != Guid.Empty ? targetPharmacyId : (validation.Payload?.FacilityId ?? Guid.NewGuid()),
                PharmacyName = validation.Payload?.FacilityName ?? "Pharmacy Facility",
                LicenseToken = request.LicenseToken.Trim(),
                EntitlementVersion = validation.Payload?.EntitlementVersion ?? 0,
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
            settings.EntitlementVersion = validation.Payload?.EntitlementVersion ?? 0;
            settings.PlanTier = validation.Payload?.PlanTier ?? "Community";
            settings.MaxStaffLimit = validation.Payload?.Limits?.MaxStaff ?? 5;
            settings.LicenseExpiresAt = validation.Payload?.ExpiresAtUtc;
        }

        await _unitOfWork.SaveChangesAsync(ct);

        var activeStaffCount = await CountActiveStaffAsync(settings.PharmacyId, ct);

        var status = validation.IsExpired ? "Expired" : "Active";

        var dto = new PharmacyLicenseStatusDto(
            status,
            settings.PharmacyId,
            settings.PharmacyName,
            validation.Payload?.PlanTier ?? settings.PlanTier,
            validation.Payload?.Limits ?? PlanTierDefaults.GetLimitsForTier(settings.PlanTier),
            activeStaffCount,
            validation.Payload?.EnabledFeatures ?? PlanTierDefaults.GetFeaturesForTier(settings.PlanTier),
            validation.Payload?.ExpiresAtUtc,
            false,
            validation.ErrorMessage,
            validation.IsReadOnlyGrace,
            validation.ReadOnlyGraceUntilUtc);

        return Ok(ApiResponse<PharmacyLicenseStatusDto>.Success(dto, "Pharmacy facility license successfully applied and verified."));
    }

    // These endpoints run before any staff session exists, so the tenant/pharmacy query filters have no scope to apply.
    // They bypass the filters explicitly and scope by the facility id instead (soft-deleted rows excluded).
    // With no facility id they resolve the pharmacy only on single-pharmacy installs; they never guess between several.
    private async Task<PharmacySettings?> FindSettingsAsync(Guid? facilityId, CancellationToken ct)
    {
        var all = _settingsRepo.Query(s => !s.IsDeleted, ignoreQueryFilters: true);

        if (facilityId.HasValue && facilityId.Value != Guid.Empty)
        {
            return await all.FirstOrDefaultAsync(s => s.PharmacyId == facilityId.Value, ct);
        }

        var only = await all.Take(2).ToListAsync(ct);
        return only.Count == 1 ? only[0] : null;
    }

    private Task<int> CountActiveStaffAsync(Guid pharmacyId, CancellationToken ct) =>
        pharmacyId == Guid.Empty
            ? Task.FromResult(0)
            : _staffRepo.Query(s => s.PharmacyId == pharmacyId && s.IsActive && !s.IsDeleted, ignoreQueryFilters: true).CountAsync(ct);
}
