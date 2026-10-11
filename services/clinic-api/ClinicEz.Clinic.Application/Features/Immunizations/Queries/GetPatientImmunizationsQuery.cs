using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Immunizations.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Immunizations.Queries;

public sealed record GetPatientImmunizationsQuery(Guid PatientId) : IRequest<IReadOnlyList<PatientImmunizationDto>>;

public sealed class GetPatientImmunizationsQueryHandler : IRequestHandler<GetPatientImmunizationsQuery, IReadOnlyList<PatientImmunizationDto>>
{
    private readonly IRepository<PatientImmunization> _immunizationRepo;
    private readonly IClinicContext _clinicContext;

    public GetPatientImmunizationsQueryHandler(
        IRepository<PatientImmunization> immunizationRepo,
        IClinicContext clinicContext)
    {
        _immunizationRepo = immunizationRepo;
        _clinicContext = clinicContext;
    }

    public async Task<IReadOnlyList<PatientImmunizationDto>> Handle(GetPatientImmunizationsQuery request, CancellationToken cancellationToken)
    {
        var immunizations = await _immunizationRepo.Query(i => i.PatientId == request.PatientId && i.ClinicId == _clinicContext.ClinicId)
            .AsNoTracking()
            .OrderByDescending(i => i.AdministeredAtUtc)
            .Select(i => new PatientImmunizationDto(
                i.Id,
                i.PatientId,
                i.PatientName,
                i.ConsultationEncounterId,
                i.PhilHealthLibrary,
                i.PhilHealthCode,
                i.VaccineName,
                i.BrandName,
                i.Manufacturer,
                i.LotBatchNumber,
                i.ExpirationDate,
                i.DoseSequence,
                i.IsSeriesCompleted,
                i.Route,
                i.InjectionSite,
                i.AdministeredAtUtc,
                i.AdministeredByStaffId,
                i.AdministeredByStaffName,
                i.AdministeredByPrcLicense,
                i.HasAdverseReaction,
                i.AdverseReactionSeverity,
                i.AdverseReactionRemarks,
                i.AdverseReactionRecordedAtUtc,
                i.IsHistorical,
                i.HistoricalFacilityName,
                i.Remarks,
                i.IsSynchronizedToPatientApp,
                i.SynchronizedAtUtc
            ))
            .ToListAsync(cancellationToken);

        return immunizations;
    }
}
