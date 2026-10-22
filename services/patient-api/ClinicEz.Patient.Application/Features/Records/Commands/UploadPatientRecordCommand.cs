using System;
using System.IO;
using ClinicEz.Patient.Application.Features.Records.DTOs;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Records.Commands;

public sealed record UploadPatientRecordCommand(
    Guid PatientId,
    Stream Content,
    string FileName,
    string ContentType,
    long SizeBytes,
    Guid DocumentTypeId,
    string Title,
    DateOnly? DocumentDate,
    string? FacilityName,
    string? Notes,
    Guid? ClientFileId = null
) : IRequest<FileRecordDto>;
