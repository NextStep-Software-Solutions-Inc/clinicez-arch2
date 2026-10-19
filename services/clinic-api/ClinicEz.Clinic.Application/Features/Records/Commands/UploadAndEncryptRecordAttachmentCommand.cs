using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Records.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Records.Commands;

public sealed record UploadAndEncryptRecordAttachmentCommand(
    Guid PatientId,
    Guid? ConsultationId,
    string RecordType,
    string Title,
    string FileName,
    string ContentType,
    byte[] FileBytes,
    string? Notes = null,
    Guid? UploadedByStaffId = null,
    string? UploadedByStaffName = null) : IRequest<ClinicRecordAttachmentDto>;

public sealed class UploadAndEncryptRecordAttachmentCommandHandler : IRequestHandler<UploadAndEncryptRecordAttachmentCommand, ClinicRecordAttachmentDto>
{
    private readonly IRepository<ClinicRecordAttachment> _attachmentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicEncryptionService _encryptionService;
    private readonly IClinicStorageService _storageService;

    public UploadAndEncryptRecordAttachmentCommandHandler(
        IRepository<ClinicRecordAttachment> attachmentRepo,
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

    public async Task<ClinicRecordAttachmentDto> Handle(UploadAndEncryptRecordAttachmentCommand request, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request.FileBytes);
        if (request.FileBytes.Length == 0)
        {
            throw new ArgumentException("Uploaded file cannot be empty.", nameof(request));
        }

        var attachmentId = Guid.NewGuid();
        var tenantId = _clinicContext.TenantId ?? "default";
        var clinicId = _clinicContext.ClinicId;

        // 1. Encrypt file with Clinic Master Key (CMK)
        var encryptedPayload = await _encryptionService.EncryptAsync(request.FileBytes, tenantId, clinicId, ct);

        // 2. Persist encrypted ciphertext into clinic storage
        var storageKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{attachmentId}.cez";
        await _storageService.SaveEncryptedFileAsync(storageKey, encryptedPayload.Ciphertext, ct);

        // 3. Create verified attachment record
        var attachment = new ClinicRecordAttachment
        {
            Id = attachmentId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = request.PatientId,
            ConsultationId = request.ConsultationId,
            RecordType = string.IsNullOrWhiteSpace(request.RecordType) ? "LabResult" : request.RecordType.Trim(),
            Title = string.IsNullOrWhiteSpace(request.Title) ? request.FileName : request.Title.Trim(),
            FileName = request.FileName.Trim(),
            ContentType = string.IsNullOrWhiteSpace(request.ContentType) ? "application/pdf" : request.ContentType.Trim(),
            FileSizeBytes = encryptedPayload.EncryptedSizeBytes,
            StorageUri = storageKey,
            DocumentDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Notes = request.Notes?.Trim(),
            UploadedByStaffId = request.UploadedByStaffId,
            UploadedByStaffName = request.UploadedByStaffName ?? "Clinic Staff",
            VerificationStatus = "Verified",
            VerifiedAt = DateTime.UtcNow,
            VerifiedByStaffId = request.UploadedByStaffId,
            VerifiedByStaffName = request.UploadedByStaffName ?? "Clinic Staff",
            EncryptionAlgorithm = encryptedPayload.EncryptionAlgorithm,
            EncryptionKeyId = "cmk-v1",
            EncryptionIvBase64 = encryptedPayload.IvBase64,
            EncryptionTagBase64 = encryptedPayload.TagBase64,
            EncryptedSizeBytes = encryptedPayload.EncryptedSizeBytes,
            EncryptedHash = encryptedPayload.EncryptedHash,
            WrappedKeyJson = encryptedPayload.WrappedKeyJson,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = request.UploadedByStaffName ?? "ClinicStaff"
        };

        await _attachmentRepo.AddAsync(attachment, ct);
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
