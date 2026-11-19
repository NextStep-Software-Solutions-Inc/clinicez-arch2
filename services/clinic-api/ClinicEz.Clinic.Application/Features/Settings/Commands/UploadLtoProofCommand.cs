using System;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Commands;

public sealed record EvidenceProofUploadResultDto(string ObjectKey);

public sealed record UploadLtoProofCommand(
    string FileName,
    string ContentType,
    long FileSizeBytes,
    [property: JsonIgnore] byte[] FileBytes
) : IRequest<EvidenceProofUploadResultDto>;

public sealed class UploadLtoProofCommandHandler : IRequestHandler<UploadLtoProofCommand, EvidenceProofUploadResultDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicStorageService _storageService;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicEncryptionService? _encryptionService;
    private readonly IRepository<AuditEntry>? _auditRepo;

    public UploadLtoProofCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IClinicStorageService storageService,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IClinicEncryptionService? encryptionService = null,
        IRepository<AuditEntry>? auditRepo = null)
    {
        _settingsRepo = settingsRepo;
        _storageService = storageService;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _encryptionService = encryptionService;
        _auditRepo = auditRepo;
    }

    public async Task<EvidenceProofUploadResultDto> Handle(UploadLtoProofCommand request, CancellationToken ct)
    {
        var ext = VerificationEvidenceHelper.ValidateAndResolveExtension(
            request.FileName,
            request.ContentType,
            request.FileBytes?.LongLength ?? request.FileSizeBytes);

        if (request.FileBytes == null || request.FileBytes.Length == 0)
        {
            throw new ValidationException("Evidence file is required and cannot be empty.");
        }

        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            throw new NotFoundException("Clinic settings must be initialized before uploading LTO evidence.");
        }

        var rawKey = $"tenants/{settings.TenantId}/clinics/{settings.ClinicId:D}/verification/lto/{Guid.NewGuid():N}{ext}";
        var storedKey = await VerificationEvidenceHelper.StoreEncryptedEvidenceAsync(
            _storageService,
            _encryptionService,
            settings.TenantId,
            settings.ClinicId,
            rawKey,
            request.FileBytes,
            ct,
            request.ContentType,
            request.FileName);

        settings.LtoEvidenceObjectKey = storedKey;
        settings.UpdatedAt = DateTime.UtcNow;

        if (_auditRepo != null)
        {
            await _auditRepo.AddAsync(DirectoryVerificationAuditHelper.CreateEntry(
                settings.TenantId,
                settings.ClinicId,
                ClinicAuditCategories.Operations,
                ClinicAuditSeverities.Routine,
                "operations.lto_proof.uploaded",
                "FacilitySettings",
                settings.ClinicId.ToString(),
                ClinicAuditOutcomes.Success,
                $"Uploaded DOH LTO evidence document '{storedKey}'.",
                _clinicContext.StaffId,
                _clinicContext.StaffName,
                _clinicContext.StaffRole,
                new { ObjectKey = storedKey, request.ContentType, FileSizeBytes = request.FileBytes.LongLength }),
                ct);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return new EvidenceProofUploadResultDto(storedKey);
    }
}
