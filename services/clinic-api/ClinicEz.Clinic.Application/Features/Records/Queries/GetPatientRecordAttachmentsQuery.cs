using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Records.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Records.Queries;

public sealed record GetPatientRecordAttachmentsQuery(
    Guid PatientId,
    string? RecordType = null) : IRequest<IReadOnlyList<ClinicRecordAttachmentDto>>;

public sealed class GetPatientRecordAttachmentsQueryHandler : IRequestHandler<GetPatientRecordAttachmentsQuery, IReadOnlyList<ClinicRecordAttachmentDto>>
{
    private readonly IRepository<ClinicRecordAttachment> _attachmentRepo;

    public GetPatientRecordAttachmentsQueryHandler(IRepository<ClinicRecordAttachment> attachmentRepo)
    {
        _attachmentRepo = attachmentRepo;
    }

    public async Task<IReadOnlyList<ClinicRecordAttachmentDto>> Handle(GetPatientRecordAttachmentsQuery request, CancellationToken ct)
    {
        var query = _attachmentRepo.Query(a => a.PatientId == request.PatientId).AsNoTracking();

        if (!string.IsNullOrWhiteSpace(request.RecordType))
        {
            query = query.Where(a => a.RecordType == request.RecordType);
        }

        var list = await query
            .OrderByDescending(a => a.DocumentDate)
            .ThenByDescending(a => a.CreatedAt)
            .ToListAsync(ct);

        return list.Select(a => new ClinicRecordAttachmentDto(
            a.Id,
            a.TenantId,
            a.ClinicId,
            a.PatientId,
            a.ConsultationId,
            a.RecordType,
            a.Title,
            a.FileName,
            a.ContentType,
            a.FileSizeBytes,
            a.StorageUri,
            a.DocumentDate,
            a.Notes,
            a.UploadedByStaffId,
            a.UploadedByStaffName,
            a.CreatedAt)).ToList().AsReadOnly();
    }
}
