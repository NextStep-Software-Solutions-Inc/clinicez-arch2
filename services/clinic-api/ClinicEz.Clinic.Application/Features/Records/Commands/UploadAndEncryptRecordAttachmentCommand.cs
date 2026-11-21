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
    string? UploadedByStaffName = null,
    DateOnly? DocumentDate = null) : IRequest<ClinicRecordAttachmentDto>;

public sealed class UploadAndEncryptRecordAttachmentCommandHandler : IRequestHandler<UploadAndEncryptRecordAttachmentCommand, ClinicRecordAttachmentDto>
{
    private readonly IRepository<RecordAttachment> _attachmentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicEncryptionService _encryptionService;
    private readonly IClinicStorageService _storageService;

    public UploadAndEncryptRecordAttachmentCommandHandler(
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

        var resolvedStaffId = request.UploadedByStaffId.HasValue && request.UploadedByStaffId.Value != Guid.Empty
            ? request.UploadedByStaffId
            : _clinicContext.StaffId;
        var resolvedStaffName = ResolveActorStaffName(request.UploadedByStaffName, _clinicContext.StaffName);

        // 3. Create verified attachment record
        var attachment = new RecordAttachment
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
            DocumentDate = request.DocumentDate ?? DateOnly.FromDateTime(DateTime.UtcNow),
            Notes = request.Notes?.Trim(),
            UploadedByStaffId = resolvedStaffId,
            UploadedByStaffName = resolvedStaffName,
            VerificationStatus = "Verified",
            VerifiedAt = DateTime.UtcNow,
            VerifiedByStaffId = resolvedStaffId,
            VerifiedByStaffName = resolvedStaffName,
            EncryptionAlgorithm = encryptedPayload.EncryptionAlgorithm,
            EncryptionKeyId = "cmk-v1",
            EncryptionIvBase64 = encryptedPayload.IvBase64,
            EncryptionTagBase64 = encryptedPayload.TagBase64,
            EncryptedSizeBytes = encryptedPayload.EncryptedSizeBytes,
            EncryptedHash = encryptedPayload.EncryptedHash,
            WrappedKeyJson = encryptedPayload.WrappedKeyJson,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = resolvedStaffName
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

    internal static string ResolveActorStaffName(string? explicitName, string? contextStaffName)
    {
        var trimmedExplicit = explicitName?.Trim();
        var trimmedContext = contextStaffName?.Trim();

        if (!string.IsNullOrWhiteSpace(trimmedExplicit) && !IsGenericStaffPlaceholder(trimmedExplicit))
        {
            return trimmedExplicit;
        }

        if (!string.IsNullOrWhiteSpace(trimmedContext) && !IsGenericStaffPlaceholder(trimmedContext))
        {
            return trimmedContext;
        }

        if (!string.IsNullOrWhiteSpace(trimmedExplicit))
        {
            return trimmedExplicit;
        }

        return "Clinic Staff";
    }

    private static bool IsGenericStaffPlaceholder(string value) =>
        string.Equals(value, "Clinic Staff", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(value, "ClinicStaff", StringComparison.OrdinalIgnoreCase);
}
