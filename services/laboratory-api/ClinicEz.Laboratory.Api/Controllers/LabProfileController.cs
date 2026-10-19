using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Api.Authorization;
using ClinicEz.Laboratory.Domain.Constants;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Api.Controllers;

/// <summary>The laboratory's own letterhead: what its diagnostic reports print about it. Blank values are never replaced.</summary>
public sealed record LabProfileDto(
    string LaboratoryName,
    string? LicenseToOperateNumber,
    string? PhilHealthAccreditationNumber,
    string? PhysicalAddress,
    string? ContactNumbers,
    string? EmailAndWeb);

public sealed record UpdateLabProfileRequest
{
    [StringLength(100)] public string? LicenseToOperateNumber { get; init; }
    [StringLength(100)] public string? PhilHealthAccreditationNumber { get; init; }
    [StringLength(300)] public string? PhysicalAddress { get; init; }
    [StringLength(200)] public string? ContactNumbers { get; init; }
    [StringLength(200)] public string? EmailAndWeb { get; init; }
}

[ApiController]
[Route("api/v1/laboratory/profile")]
public sealed class LabProfileController : ControllerBase
{
    private readonly IRepository<LabSettings> _settingsRepo;
    private readonly IUnitOfWork _unitOfWork;

    public LabProfileController(IRepository<LabSettings> settingsRepo, IUnitOfWork unitOfWork)
    {
        _settingsRepo = settingsRepo;
        _unitOfWork = unitOfWork;
    }

    [HttpGet]
    [HasPermission(LabPermissions.StaffRead)]
    public async Task<ActionResult<ApiResponse<LabProfileDto>>> GetProfile(CancellationToken ct)
    {
        // The repository is already scoped to the signed-in laboratory.
        var settings = await _settingsRepo.Query().AsNoTracking().FirstOrDefaultAsync(s => !s.IsDeleted, ct);
        return settings is null
            ? NotFound(ApiResponse<LabProfileDto>.Fail("Laboratory profile not found."))
            : Ok(ApiResponse<LabProfileDto>.Success(ToDto(settings)));
    }

    [HttpPut]
    [HasPermission(LabPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<LabProfileDto>>> UpdateProfile(
        [FromBody] UpdateLabProfileRequest request,
        CancellationToken ct)
    {
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(s => !s.IsDeleted, ct);
        if (settings is null)
            return NotFound(ApiResponse<LabProfileDto>.Fail("Laboratory profile not found."));

        settings.LicenseToOperateNumber = Clean(request.LicenseToOperateNumber);
        settings.PhilHealthAccreditationNumber = Clean(request.PhilHealthAccreditationNumber);
        settings.PhysicalAddress = Clean(request.PhysicalAddress);
        settings.ContactNumbers = Clean(request.ContactNumbers);
        settings.EmailAndWeb = Clean(request.EmailAndWeb);

        await _unitOfWork.SaveChangesAsync(ct);
        return Ok(ApiResponse<LabProfileDto>.Success(ToDto(settings), "Laboratory profile updated."));
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static LabProfileDto ToDto(LabSettings s) => new(
        s.LaboratoryName,
        s.LicenseToOperateNumber,
        s.PhilHealthAccreditationNumber,
        s.PhysicalAddress,
        s.ContactNumbers,
        s.EmailAndWeb);
}
