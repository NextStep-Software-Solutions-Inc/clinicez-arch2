using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetPatientSurgicalHistoriesQuery(Guid PatientId) : IRequest<List<PatientSurgicalHistoryDto>>;

public sealed class GetPatientSurgicalHistoriesQueryHandler : IRequestHandler<GetPatientSurgicalHistoriesQuery, List<PatientSurgicalHistoryDto>>
{
    private readonly IRepository<PatientSurgicalHistory> _surgicalRepo;
    private readonly ILegacyPatientProfileIngestionService _legacyIngestion;

    public GetPatientSurgicalHistoriesQueryHandler(
        IRepository<PatientSurgicalHistory> surgicalRepo,
        ILegacyPatientProfileIngestionService legacyIngestion)
    {
        _surgicalRepo = surgicalRepo;
        _legacyIngestion = legacyIngestion;
    }

    public async Task<List<PatientSurgicalHistoryDto>> Handle(GetPatientSurgicalHistoriesQuery request, CancellationToken cancellationToken)
    {
        await _legacyIngestion.EnsureIngestedAsync(request.PatientId, cancellationToken);

        var entries = await _surgicalRepo.Query(s => s.PatientId == request.PatientId)
            .OrderByDescending(s => s.SurgeryDate)
            .ToListAsync(cancellationToken);

        return entries.Select(e => new PatientSurgicalHistoryDto(
            e.Id,
            e.PatientId,
            e.ProcedureName,
            e.SurgeryDate,
            e.HospitalName,
            e.Findings,
            e.Complications,
            e.Remarks)).ToList();
    }
}
