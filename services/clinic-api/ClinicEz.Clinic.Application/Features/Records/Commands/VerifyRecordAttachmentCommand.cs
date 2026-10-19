using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Records.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Application.Features.Records.Commands;

public sealed record VerifyRecordAttachmentCommand(
    Guid AttachmentId,
    bool IsApproved,
    string? RejectionReason = null) : IRequest<ClinicRecordAttachmentDto>;

public sealed class VerifyRecordAttachmentCommandHandler : IRequestHandler<VerifyRecordAttachmentCommand, ClinicRecordAttachmentDto>
{
    private readonly IRepository<ClinicRecordAttachment> _attachmentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicRecordEventPublisher _eventPublisher;

    public VerifyRecordAttachmentCommandHandler(
        IRepository<ClinicRecordAttachment> attachmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IClinicRecordEventPublisher eventPublisher)
    {
        _attachmentRepo = attachmentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _eventPublisher = eventPublisher;
    }

    public async Task<ClinicRecordAttachmentDto> Handle(VerifyRecordAttachmentCommand request, CancellationToken ct)
    {
        var attachment = await _attachmentRepo.Query()
            .FirstOrDefaultAsync(a => a.Id == request.AttachmentId, ct);

        if (attachment == null)
        {
            throw new KeyNotFoundException($"Attachment '{request.AttachmentId}' not found.");
        }

        attachment.VerificationStatus = request.IsApproved ? "Verified" : "Rejected";
        attachment.RejectionReason = request.IsApproved ? null : request.RejectionReason?.Trim();
        attachment.VerifiedAt = DateTime.UtcNow;
        attachment.VerifiedByStaffId = _clinicContext.StaffId;
        attachment.VerifiedByStaffName = "ClinicStaff";
        attachment.UpdatedAt = DateTime.UtcNow;

        await _eventPublisher.PublishRecordVerifiedAsync(new ClinicRecordVerifiedEvent
        {
            AttachmentId = attachment.Id,
            TenantId = attachment.TenantId,
            ClinicId = attachment.ClinicId,
            PatientId = attachment.PatientId,
            RecordType = attachment.RecordType,
            Title = attachment.Title,
            FileName = attachment.FileName,
            ContentType = attachment.ContentType,
            FileSizeBytes = attachment.FileSizeBytes,
            VerificationStatus = attachment.VerificationStatus,
            RejectionReason = attachment.RejectionReason,
            VerifiedAt = attachment.VerifiedAt ?? DateTime.UtcNow,
            VerifiedByStaffName = attachment.VerifiedByStaffName
        }, ct);

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
