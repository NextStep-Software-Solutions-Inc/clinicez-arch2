using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Records.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Records.Commands;

public sealed record IntakePatientSharedFileCommand(
    Guid PatientId,
    Guid? AppointmentId,
    Guid? ConsultationId,
    Guid? FileId,
    string RecordType,
    string Title,
    string FileName,
    string ContentType,
    byte[] FileBytes,
    string? Notes = null) : IRequest<ClinicRecordAttachmentDto>;

public sealed class IntakePatientSharedFileCommandHandler : IRequestHandler<IntakePatientSharedFileCommand, ClinicRecordAttachmentDto>
{
    private readonly IRepository<RecordAttachment> _attachmentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicEncryptionService _encryptionService;
    private readonly IClinicStorageService _storageService;

    public IntakePatientSharedFileCommandHandler(
        IRepository<RecordAttachment> attachmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IClinicEncryptionService encryptionService,
        IClinicStorageService storageService)
    {
        _attachmentRepo = attachmentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _encryptionService = encryptionService;
        _storageService = storageService;
    }

    public async Task<ClinicRecordAttachmentDto> Handle(IntakePatientSharedFileCommand request, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request.FileBytes);
        if (request.FileBytes.Length == 0)
        {
            throw new ArgumentException("Uploaded file cannot be empty.", nameof(request));
        }

        var attachmentId = request.FileId.HasValue && request.FileId.Value != Guid.Empty
            ? request.FileId.Value
            : Guid.NewGuid();
        var tenantId = _clinicContext.TenantId ?? "default";
        var clinicId = _clinicContext.ClinicId;

        // 1. Authorization check: prevent cross-patient attachment linking & unauthorized storage overwrite
        RecordAttachment? existing = null;
        if (request.FileId.HasValue && request.FileId.Value != Guid.Empty)
        {
            existing = await _attachmentRepo.GetByIdAsync(attachmentId, ct);
            if (existing != null && existing.PatientId != request.PatientId)
            {
                throw new ForbiddenException("Cross-patient attachment linking is prohibited. Attachment belongs to another patient.");
            }
        }

        // 2. Encrypt the file stream with the Clinic Master Key (CMK) ONLY after authorization succeeds
        var encryptedPayload = await _encryptionService.EncryptAsync(request.FileBytes, tenantId, clinicId, ct);

        // 3. Persist the encrypted ciphertext into the clinic's isolated storage ONLY after authorization succeeds
        var storageKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{attachmentId}.cez";
        await _storageService.SaveEncryptedFileAsync(storageKey, encryptedPayload.Ciphertext, ct);

        // 4. Create or update the RecordAttachment in PendingVerification status
        var attachment = existing ?? new RecordAttachment
        {
            Id = attachmentId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = request.PatientId,
            Title = string.IsNullOrWhiteSpace(request.Title) ? request.FileName : request.Title.Trim(),
            FileName = request.FileName.Trim(),
            StorageUri = storageKey,
        };

        attachment.TenantId = tenantId;
        attachment.ClinicId = clinicId;
        attachment.PatientId = request.PatientId;
        if (request.ConsultationId.HasValue)
        {
            attachment.ConsultationId = request.ConsultationId.Value;
        }
        attachment.RecordType = string.IsNullOrWhiteSpace(request.RecordType) ? "LabResult" : request.RecordType.Trim();
        attachment.Title = string.IsNullOrWhiteSpace(request.Title) ? request.FileName : request.Title.Trim();
        attachment.FileName = request.FileName.Trim();
        attachment.ContentType = string.IsNullOrWhiteSpace(request.ContentType) ? "application/pdf" : request.ContentType.Trim();
        attachment.FileSizeBytes = encryptedPayload.EncryptedSizeBytes;
        attachment.StorageUri = storageKey;
        attachment.DocumentDate = DateOnly.FromDateTime(DateTime.UtcNow);
        attachment.Notes = request.Notes?.Trim() ?? attachment.Notes ?? "Attached by patient during booking";
        attachment.UploadedByStaffName = "Student Self-Upload (Mobile Portal)";
        attachment.VerificationStatus = "PendingVerification";
        attachment.EncryptionAlgorithm = encryptedPayload.EncryptionAlgorithm;
        attachment.EncryptionKeyId = "cmk-v1";
        attachment.EncryptionIvBase64 = encryptedPayload.IvBase64;
        attachment.EncryptionTagBase64 = encryptedPayload.TagBase64;
        attachment.EncryptedSizeBytes = encryptedPayload.EncryptedSizeBytes;
        attachment.EncryptedHash = encryptedPayload.EncryptedHash;
        attachment.WrappedKeyJson = encryptedPayload.WrappedKeyJson;

        if (existing == null)
        {
            attachment.CreatedAt = DateTime.UtcNow;
            attachment.CreatedBy = "PatientPortal:SharedIntake";
            await _attachmentRepo.AddAsync(attachment, ct);
        }
        else
        {
            attachment.UpdatedAt = DateTime.UtcNow;
            attachment.UpdatedBy = "PatientPortal:SharedIntake";
            _attachmentRepo.Update(attachment);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return new ClinicRecordAttachmentDto(
            attachment.Id,
            attachment.TenantId,
            attachment.ClinicId,
            attachment.PatientId,
            attachment.ConsultationId,
            attachment.RecordType,
            attachment.Title,
            attachment.FileName,
            attachment.ContentType,
            attachment.FileSizeBytes,
            attachment.StorageUri,
            attachment.DocumentDate,
            attachment.Notes,
            attachment.UploadedByStaffId,
            attachment.UploadedByStaffName,
            attachment.CreatedAt,
            attachment.VerificationStatus,
            attachment.RejectionReason,
            attachment.VerifiedAt,
            attachment.VerifiedByStaffId,
            attachment.VerifiedByStaffName,
            attachment.EncryptionAlgorithm,
            attachment.EncryptionKeyId,
            attachment.EncryptedSizeBytes,
            attachment.EncryptedHash);
    }
}
