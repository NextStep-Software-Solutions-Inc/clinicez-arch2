using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Consultations.Queries;

public sealed record GetConsultationsQuery(
    Guid? PatientId = null,
    Guid? DoctorId = null,
    bool? IsSigned = null) : IRequest<IReadOnlyList<ConsultationEncounterDto>>;

public sealed class GetConsultationsQueryHandler : IRequestHandler<GetConsultationsQuery, IReadOnlyList<ConsultationEncounterDto>>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepository;
    private readonly IClinicContext _clinicContext;

    public GetConsultationsQueryHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IClinicContext clinicContext)
    {
        _consultationRepository = consultationRepository;
        _clinicContext = clinicContext;
    }

    public async Task<IReadOnlyList<ConsultationEncounterDto>> Handle(GetConsultationsQuery request, CancellationToken cancellationToken)
    {
        var query = _consultationRepository.Query(c => c.ClinicId == _clinicContext.ClinicId)
            .Include(c => c.Diagnoses)
            .Include(c => c.Prescriptions)
            .Include(c => c.PhysicalExams)
                .ThenInclude(p => p.Findings)
            .AsQueryable();

        if (request.PatientId.HasValue)
        {
            query = query.Where(c => c.PatientId == request.PatientId.Value);
        }

        if (request.DoctorId.HasValue)
        {
            query = query.Where(c => c.DoctorId == request.DoctorId.Value);
        }

        if (request.IsSigned.HasValue)
        {
            query = query.Where(c => c.IsSigned == request.IsSigned.Value);
        }

        var list = await query
            .OrderByDescending(c => c.EncounterDate)
            .ToListAsync(cancellationToken);

        return list.Select(encounter => ConsultationPlanManagementMapper.ToDto(encounter)).ToList();
    }
}

public sealed record GetConsultationByIdQuery(Guid Id) : IRequest<ConsultationEncounterDto>;

public sealed class GetConsultationByIdQueryHandler : IRequestHandler<GetConsultationByIdQuery, ConsultationEncounterDto>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepository;
    private readonly IClinicContext _clinicContext;

    public GetConsultationByIdQueryHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IClinicContext clinicContext)
    {
        _consultationRepository = consultationRepository;
        _clinicContext = clinicContext;
    }

    public async Task<ConsultationEncounterDto> Handle(GetConsultationByIdQuery request, CancellationToken cancellationToken)
    {
        var encounter = await _consultationRepository.Query(c => c.Id == request.Id && c.ClinicId == _clinicContext.ClinicId)
            .Include(c => c.Diagnoses)
            .Include(c => c.Prescriptions)
            .Include(c => c.PhysicalExams)
                .ThenInclude(p => p.Findings)
            .FirstOrDefaultAsync(cancellationToken);

        if (encounter == null)
        {
            throw new NotFoundException($"Encounter '{request.Id}' was not found in this clinic.");
        }

        return ConsultationPlanManagementMapper.ToDto(
            encounter,
            rxStatus: RxPharmacyStatusDto.From(encounter));
    }
}
