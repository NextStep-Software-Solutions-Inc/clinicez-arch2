using System;
using ClinicEz.Patient.Application.Features.Records.DTOs;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Records.Queries;

public sealed record StreamPatientRecordQuery(
    Guid PatientId,
    Guid FileId
) : IRequest<DecryptedFileStreamResult>;
