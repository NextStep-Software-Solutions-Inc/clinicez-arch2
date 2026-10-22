using System;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Records.Commands;

public sealed record DeletePatientRecordCommand(
    Guid PatientId,
    Guid FileId
) : IRequest;
