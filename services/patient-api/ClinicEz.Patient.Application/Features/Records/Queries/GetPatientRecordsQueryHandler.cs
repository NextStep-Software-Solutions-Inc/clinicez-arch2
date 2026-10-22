using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.Records.DTOs;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Records.Queries;

public sealed class GetPatientRecordsQueryHandler : IRequestHandler<GetPatientRecordsQuery, IReadOnlyList<FileRecordDto>>
{
    private readonly IFileRecordRepository _fileRepository;

    public GetPatientRecordsQueryHandler(IFileRecordRepository fileRepository)
    {
        _fileRepository = fileRepository;
    }

    public async Task<IReadOnlyList<FileRecordDto>> Handle(GetPatientRecordsQuery request, CancellationToken cancellationToken)
    {
        var records = await _fileRepository.GetByPatientIdAsync(
            request.PatientId,
            request.DocumentTypeId,
            request.SearchTerm,
            request.From,
            request.To,
            cancellationToken);

        return records.Select(ToDto).ToList();
    }

    private static FileRecordDto ToDto(FileRecord record) => new(
        Id: record.Id,
        ClientId: record.ClientId,
        FileName: record.FileName,
        MimeType: record.MimeType,
        Extension: record.Extension,
        SizeBytes: record.SizeBytes,
        DocumentTypeId: record.DocumentTypeId,
        DocumentTypeName: record.DocumentType?.Label,
        Title: record.Title,
        DocumentDate: record.DocumentDate,
        FacilityName: record.FacilityName,
        Notes: record.Notes,
        UploadedAt: record.UploadedAt,
        StorageKey: record.StorageKey
    );
}
