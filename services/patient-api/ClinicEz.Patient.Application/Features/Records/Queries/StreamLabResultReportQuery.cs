using System;
using ClinicEz.Patient.Application.Features.Records.DTOs;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Records.Queries;

public sealed record StreamLabResultReportQuery(
    Guid PatientId,
    Guid ReportId
) : IRequest<DecryptedFileStreamResult>;
