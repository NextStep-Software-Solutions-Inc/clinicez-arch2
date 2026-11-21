using System;
using System.Collections.Generic;
using ClinicEz.Patient.Application.Features.Records.DTOs;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Records.Queries;

public sealed record GetPatientRecordsQuery(
    Guid PatientId,
    Guid? DocumentTypeId = null,
    string? SearchTerm = null,
    DateOnly? From = null,
    DateOnly? To = null
) : IRequest<IReadOnlyList<FileRecordDto>>;
