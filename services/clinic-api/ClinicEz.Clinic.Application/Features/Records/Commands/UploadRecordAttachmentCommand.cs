using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Records.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Records.Commands;

public sealed record UploadRecordAttachmentCommand(
    Guid PatientId,
    Guid? ConsultationId,
    string RecordType,
    string Title,
    string FileName,
    string ContentType,
    long FileSizeBytes,
    string StorageUri,
    DateOnly DocumentDate,
    string? Notes = null,
    Guid? UploadedByStaffId = null,
    string? UploadedByStaffName = null,
    string VerificationStatus = "Verified") : IRequest<ClinicRecordAttachmentDto>;

public sealed class UploadRecordAttachmentCommandHandler : IRequestHandler<UploadRecordAttachmentCommand, ClinicRecordAttachmentDto>
{
    private readonly IRepository<ClinicRecordAttachment> _attachmentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UploadRecordAttachmentCommandHandler(
        IRepository<ClinicRecordAttachment> attachmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _attachmentRepo = attachmentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<ClinicRecordAttachmentDto> Handle(UploadRecordAttachmentCommand request, CancellationToken ct)
    {
        var attachment = new ClinicRecordAttachment
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = request.PatientId,
            ConsultationId = request.ConsultationId,
            RecordType = string.IsNullOrWhiteSpace(request.RecordType) ? "LabResult" : request.RecordType.Trim(),
            Title = request.Title.Trim(),
            FileName = request.FileName.Trim(),
            ContentType = string.IsNullOrWhiteSpace(request.ContentType) ? "application/pdf" : request.ContentType.Trim(),
            FileSizeBytes = request.FileSizeBytes,
            StorageUri = request.StorageUri.Trim(),
            DocumentDate = request.DocumentDate,
            Notes = request.Notes?.Trim(),
            UploadedByStaffId = request.UploadedByStaffId,
            UploadedByStaffName = request.UploadedByStaffName?.Trim(),
            VerificationStatus = string.IsNullOrWhiteSpace(request.VerificationStatus) ? "Verified" : request.VerificationStatus,
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
            attachment.VerifiedByStaffName);
    }
}
