using System;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Staff.Commands;

public sealed record UploadStaffPrcProofCommand(
    Guid StaffId,
    string FileName,
    string ContentType,
    long FileSizeBytes,
    [property: JsonIgnore] byte[] FileBytes
) : IRequest<EvidenceProofUploadResultDto>;

public sealed class UploadStaffPrcProofCommandHandler : IRequestHandler<UploadStaffPrcProofCommand, EvidenceProofUploadResultDto>
{
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IClinicStorageService _storageService;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicEncryptionService? _encryptionService;
    private readonly IRepository<AuditEntry>? _auditRepo;

    public UploadStaffPrcProofCommandHandler(
        IRepository<StaffMember> staffRepo,
        IClinicStorageService storageService,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IClinicEncryptionService? encryptionService = null,
        IRepository<AuditEntry>? auditRepo = null)
    {
        _staffRepo = staffRepo;
        _storageService = storageService;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _encryptionService = encryptionService;
        _auditRepo = auditRepo;
    }

    public async Task<EvidenceProofUploadResultDto> Handle(UploadStaffPrcProofCommand request, CancellationToken ct)
    {
        var ext = VerificationEvidenceHelper.ValidateAndResolveExtension(
            request.FileName,
            request.ContentType,
            request.FileBytes?.LongLength ?? request.FileSizeBytes);

        if (request.FileBytes == null || request.FileBytes.Length == 0)
        {
            throw new ValidationException("Evidence file is required and cannot be empty.");
        }

        var staff = await _staffRepo.Query(s => s.Id == request.StaffId && s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(ct);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.StaffId}' was not found in this clinic.");
        }

        if (!ClinicianDirectoryValidationHelper.IsClinicianRole(staff.Role))
        {
            throw new ValidationException("PRC proof documents can only be uploaded for Doctors and Nurses.");
        }

        var rawKey = $"tenants/{staff.TenantId}/clinics/{staff.ClinicId:D}/verification/prc/{staff.Id:D}/{Guid.NewGuid():N}{ext}";
        var storedKey = await VerificationEvidenceHelper.StoreEncryptedEvidenceAsync(
            _storageService,
            _encryptionService,
            staff.TenantId,
            staff.ClinicId,
            rawKey,
            request.FileBytes,
            ct,
            request.ContentType,
            request.FileName);

        staff.PrcEvidenceObjectKey = storedKey;
        staff.UpdatedAt = DateTime.UtcNow;
        staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";
        _staffRepo.Update(staff);

        if (_auditRepo != null)
        {
            await _auditRepo.AddAsync(DirectoryVerificationAuditHelper.CreateEntry(
                staff.TenantId,
                staff.ClinicId,
                ClinicAuditCategories.Security,
                ClinicAuditSeverities.Routine,
                "security.practitioner_prc_proof.uploaded",
                "StaffMember",
                staff.Id.ToString(),
                ClinicAuditOutcomes.Success,
                $"Uploaded PRC proof evidence document '{storedKey}' for {staff.FirstName} {staff.LastName}.",
                _clinicContext.StaffId,
                _clinicContext.StaffName,
                _clinicContext.StaffRole,
                new { StaffId = staff.Id, ObjectKey = storedKey, request.ContentType, FileSizeBytes = request.FileBytes.LongLength }),
                ct);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return new EvidenceProofUploadResultDto(storedKey);
    }
}
