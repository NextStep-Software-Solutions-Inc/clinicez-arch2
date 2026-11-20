using System;
using System.ComponentModel.DataAnnotations;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Commands;

public sealed record OverridePhilHealthSettingsCommand(
    [Required] string AccreditationNumber,
    [Required] string PmccNumber,
    [Required] string SoftwareCertificateId,
    string? SecretKey,
    string? CipherKey,
    string? BaseUrl = null,
    bool SkipPendingVerificationSync = false) : IRequest<ClinicSettingsDto>;

public sealed class OverridePhilHealthSettingsCommandHandler : IRequestHandler<OverridePhilHealthSettingsCommand, ClinicSettingsDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPhilHealthProxyClient _proxyClient;
    private readonly IClinicDirectorySyncService? _directorySyncService;

    public OverridePhilHealthSettingsCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IPhilHealthProxyClient proxyClient,
        IClinicDirectorySyncService? directorySyncService = null)
    {
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _proxyClient = proxyClient;
        _directorySyncService = directorySyncService;
    }

    public async Task<ClinicSettingsDto> Handle(OverridePhilHealthSettingsCommand request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.AccreditationNumber))
            throw new ArgumentException("PhilHealth Accreditation Number is required.", nameof(request.AccreditationNumber));

        if (string.IsNullOrWhiteSpace(request.PmccNumber))
            throw new ArgumentException("PhilHealth PMCC Number is required.", nameof(request.PmccNumber));

        if (string.IsNullOrWhiteSpace(request.SoftwareCertificateId))
            throw new ArgumentException("PhilHealth Software Certificate ID is required.", nameof(request.SoftwareCertificateId));

        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            settings = new FacilitySettings
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                ClinicName = "Clinic Facility",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System"
            };
            await _settingsRepo.AddAsync(settings, ct);
        }

        var baseUrl = !string.IsNullOrWhiteSpace(request.BaseUrl)
            ? request.BaseUrl.Trim()
            : (!string.IsNullOrWhiteSpace(settings.PhilHealthBaseUrl) ? settings.PhilHealthBaseUrl : "https://pcapi.philhealth.gov.ph");

        var proxyRequest = new ConfigurePhilHealthCredentialsProxyRequest(
            TenantId: Guid.TryParse(_clinicContext.TenantId, out var tid) ? tid : _clinicContext.ClinicId,
            FacilityName: settings.ClinicName,
            AccreditationNumber: request.AccreditationNumber.Trim(),
            PmccNumber: request.PmccNumber.Trim(),
            SoftwareCertificateId: request.SoftwareCertificateId.Trim(),
            SecretKey: request.SecretKey ?? string.Empty,
            CipherKey: !string.IsNullOrWhiteSpace(request.CipherKey) ? request.CipherKey : "CLINICEZ-SANDBOX-CIPHER-KEY-32CH!",
            BaseUrl: baseUrl);

        var proxyResult = await _proxyClient.ConfigureTenantCredentialsAsync(proxyRequest, ct);
        if (!proxyResult.Succeeded)
        {
            throw new InvalidOperationException(proxyResult.Message ?? "Failed to update PhilHealth connection settings.");
        }

        settings.IsPhilHealthOverridden = true;
        settings.AccreditationNumber = request.AccreditationNumber.Trim();
        settings.PmccNumber = request.PmccNumber.Trim();
        settings.SoftwareCertificateId = request.SoftwareCertificateId.Trim();
        settings.PhilHealthBaseUrl = baseUrl;
        settings.IsPhilHealthConfigured = true;
        settings.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        if (!request.SkipPendingVerificationSync
            && _directorySyncService != null
            && settings.PlatformVerificationStatus == PlatformVerificationStatus.PendingReview)
        {
            await _directorySyncService.SyncPendingFacilityVerificationAsync(
                settings,
                throwOnConflict: false,
                _clinicContext.StaffId?.ToString(),
                _clinicContext.StaffName,
                ct);
        }

        return ClinicSettingsDto.FromEntity(settings);
    }
}
